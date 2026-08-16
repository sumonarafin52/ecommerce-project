// app/api/products/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { searchProducts } from "@/lib/productSearch";

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const canManage = session?.user ? await hasPermission(session, "products") : false;

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
    const limit = Math.min(100, parseInt(searchParams.get("limit")) || 12);

    const { products, total, totalPages, didYouMean } = await searchProducts({ params, canManage, page, limit });

    return NextResponse.json({
      success: true,
      data: { products, total, page, totalPages, ...(didYouMean ? { didYouMean } : {}) },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
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

// ===== CREATE PRODUCT (permission protected) =====
export async function POST(request) {
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

    // server-side validation
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ success: false, message: "Product title is required" }, { status: 400 });
    }
    if (!body.category || !body.category.trim()) {
      return NextResponse.json({ success: false, message: "Category is required" }, { status: 400 });
    }
    if (body.price === undefined || isNaN(Number(body.price)) || Number(body.price) < 0) {
      return NextResponse.json({ success: false, message: "Valid price is required" }, { status: 400 });
    }
    if (body.discountPrice && (isNaN(Number(body.discountPrice)) || Number(body.discountPrice) >= Number(body.price))) {
      return NextResponse.json({ success: false, message: "Selling price must be lower than old price" }, { status: 400 });
    }

    const product = await Product.create({
      name: body.name.trim(),
      description: body.description || "",
      shortDescription: body.shortDescription || "",
      category: body.category.trim(),
      subcategory: body.subcategory || "",
      brand: body.brand || "",
            sku: (body.sku || "").trim() || (await generateSku()),
      weight: Number(body.weight) || 0,
      tags: Array.isArray(body.tags) ? body.tags : [],
      price: Number(body.price),
      discountPrice: Number(body.discountPrice) || 0,
      images: Array.isArray(body.images) ? body.images : [],
      stock: Number(body.stock) || 0,
      lowStockThreshold: Number(body.lowStockThreshold) || 5,
      featured: Boolean(body.featured),
      status: ["public", "private", "draft", "unlisted"].includes(body.status) ? body.status : "public",
      options: Array.isArray(body.options) ? body.options : [],
      combinations: Array.isArray(body.combinations) ? body.combinations : [],
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    if (error.name === "ValidationError") {
      return NextResponse.json({ success: false, message: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}