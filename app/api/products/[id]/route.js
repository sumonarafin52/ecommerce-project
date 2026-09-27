// app/api/products/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { hasPermission } from "@/lib/rbac";
import { notifyBackInStock } from "@/lib/inventoryEvents";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

// ===== GET: status-aware single product =====
export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const canManage = session?.user ? await hasPermission(session, "products") : false;

    const product = await Product.findById(params.id);
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
      const finalPrice = update.price !== undefined ? update.price : (await Product.findById(params.id))?.price;
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
    if (body.status !== undefined && ["public", "private", "draft", "unlisted"].includes(body.status))
      update.status = body.status;
    if (body.options !== undefined) update.options = Array.isArray(body.options) ? body.options : [];
    if (body.combinations !== undefined)
      update.combinations = Array.isArray(body.combinations) ? body.combinations : [];

    const product = await Product.findByIdAndUpdate(params.id, update, { new: true });
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

    const product = await Product.findByIdAndDelete(params.id);
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Product deleted" });
  } catch (error) {
    return serverError(error, "api/products/[id]");
  }
}