// app/api/products/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { recordMovement } from "@/lib/productStock";
import { STOCK_REASONS } from "@/models/StockMovement";
import { hasPermission } from "@/lib/rbac";
import { notifyBackInStock } from "@/lib/inventoryEvents";
import { findProductByParam, productFilter } from "@/lib/productLookup";
import { resolveSlug } from "@/lib/productSlug";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

// ===== GET: status-aware single product =====
export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const canManage = session?.user ? await hasPermission(session, "products") : false;

    // The segment is a slug for anything linked today, or an ObjectId for
    // links shared before slugs existed — both resolve, neither is treated
    // as the other. A malformed value is a 404 rather than the CastError
    // 500 it used to produce.
    const product = await findProductByParam(params.id);
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    // VISIBILITY RULES:
    // public   = sobai dekhte parbe
    // unlisted = direct URL e sobai dekhte parbe (list e ashbe na)
    // private/draft = sudhu manager/admin
    if (!canManage && (product.status === "private" || product.status === "draft")) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    return serverError(error, "api/products/[id]");
  }
}
// ===== AUTO SKU GENERATOR (SA-SKU-1, SA-SKU-2, ...) =====
const generateSku = async () => {
  let n = (await Product.countDocuments()) + 1;
  let sku = `SA-SKU-${n}`;
  while (await Product.findOne({ sku })) {
    n += 1;
    sku = `SA-SKU-${n}`;
  }
  return sku;
};
// ===== PUT: admin update =====
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission to manage products" }, { status: 403 });
    }

    // Admin links carry the id, but a slug must not reach findByIdAndUpdate
    // and throw a CastError — resolve either form to the real id first.
    const target = await findProductByParam(params.id, { select: "_id slug name", lean: true });
    if (!target) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }
    const productId = target._id;

    const body = await request.json();
    const update = {};

    if (body.name !== undefined) {
      if (!body.name || !body.name.trim()) {
        return NextResponse.json({ success: false, message: "Product title is required" }, { status: 400 });
      }
      update.name = body.name.trim();
    }
    if (body.category !== undefined) {
      if (!body.category || !body.category.trim()) {
        return NextResponse.json({ success: false, message: "Category is required" }, { status: 400 });
      }
      update.category = body.category.trim();
    }
    if (body.price !== undefined) {
      if (isNaN(Number(body.price)) || Number(body.price) < 0) {
        return NextResponse.json({ success: false, message: "Valid price is required" }, { status: 400 });
      }
      update.price = Number(body.price);
    }
    if (body.discountPrice !== undefined) {
      const dp = Number(body.discountPrice) || 0;
      const finalPrice = update.price !== undefined ? update.price : (await Product.findById(productId))?.price;
      if (dp > 0 && dp >= finalPrice) {
        return NextResponse.json({ success: false, message: "Selling price must be lower than old price" }, { status: 400 });
      }
      update.discountPrice = dp;
    }

    if (body.description !== undefined) update.description = body.description || "";
    if (body.shortDescription !== undefined) update.shortDescription = body.shortDescription || "";
    if (body.subcategory !== undefined) update.subcategory = body.subcategory || "";
    if (body.brand !== undefined) update.brand = body.brand || "";
        if (body.sku !== undefined) update.sku = body.sku.trim() || (await generateSku());
    if (body.weight !== undefined) update.weight = Number(body.weight) || 0;
    if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.images !== undefined) update.images = Array.isArray(body.images) ? body.images : [];
    if (body.stock !== undefined) update.stock = Number(body.stock) || 0;
    if (body.lowStockThreshold !== undefined) update.lowStockThreshold = Number(body.lowStockThreshold) || 5;
    if (body.featured !== undefined) update.featured = Boolean(body.featured);
    // See the create route: these were dropped on every save, so the admin's
    // digital-delivery select never persisted.
    if (body.digitalProduct !== undefined) {
      update.digitalProduct = /^[0-9a-fA-F]{24}$/.test(String(body.digitalProduct || "")) ? body.digitalProduct : null;
    }
    if (body.shippingRequirement !== undefined) {
      update.shippingRequirement = ["auto", "always", "never"].includes(body.shippingRequirement)
        ? body.shippingRequirement
        : "auto";
    }
    if (body.status !== undefined && ["public", "private", "draft", "unlisted"].includes(body.status))
      update.status = body.status;
    if (body.options !== undefined) update.options = Array.isArray(body.options) ? body.options : [];
    if (body.combinations !== undefined)
      update.combinations = Array.isArray(body.combinations) ? body.combinations : [];

    // The slug only changes when staff edit it, or when a product that never
    // had one is saved. Renaming a product deliberately does NOT move its
    // URL: every link already shared would break, and the old URL is the one
    // search engines have indexed. Staff can still change it by hand.
    if (body.slug !== undefined && String(body.slug).trim()) {
      update.slug = await resolveSlug({ requested: body.slug, name: update.name, excludeId: productId });
    } else {
      if (!target.slug) {
        update.slug = await resolveSlug({
          name: update.name || target.name,
          excludeId: productId,
          fallback: String(productId),
        });
      }
    }

    // What the stock number was before this save, so the change a person
    // made is recorded like every other movement. Without this, "someone
    // changed it" was the one kind of change with no trace — and the one
    // most likely to be questioned later.
    const before = update.stock !== undefined || update.combinations !== undefined
      ? await Product.findById(productId).select("stock combinations").lean()
      : null;

    const product = await Product.findByIdAndUpdate(productId, update, { new: true });

    if (product && before) {
      const who = { id: session?.user?.id || null, name: session?.user?.name || "Staff" };

      if (update.stock !== undefined && Number(update.stock) !== (before.stock ?? 0)) {
        await recordMovement({
          product: product._id,
          delta: Number(update.stock) - (before.stock ?? 0),
          reason: STOCK_REASONS.MANUAL,
          by: who,
          note: "stock edited on the product page",
        });
      }

      // Variants each keep their own count, so each one that moved is its
      // own row — a single "the product changed" line would be unreadable
      // on a product with a dozen combinations.
      if (update.combinations !== undefined) {
        const was = new Map((before.combinations || []).map((c) => [c.key, c.stock ?? 0]));
        for (const combo of product.combinations || []) {
          const previous = was.get(combo.key);
          if (previous === undefined || previous === (combo.stock ?? 0)) continue;
          await recordMovement({
            product: product._id,
            combinationKey: combo.key,
            delta: (combo.stock ?? 0) - previous,
            reason: STOCK_REASONS.MANUAL,
            by: who,
            note: "variant stock edited on the product page",
          });
        }
      }
    }
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    // A restock (or re-publishing) may satisfy customers who asked to be
    // told when it's back. Not awaited: the admin's save shouldn't wait on
    // sending emails.
    if (update.stock !== undefined || update.combinations !== undefined || update.status !== undefined) {
      notifyBackInStock(product._id);
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error.name === "ValidationError") {
      return NextResponse.json({ success: false, message: "Validation failed" }, { status: 400 });
    }
    return serverError(error, "api/products/[id]");
  }
}

// ===== DELETE: admin delete =====
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission to manage products" }, { status: 403 });
    }

    const product = await Product.findOneAndDelete(productFilter(params.id) || { _id: null });
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Product deleted" });
  } catch (error) {
    return serverError(error, "api/products/[id]");
  }
}