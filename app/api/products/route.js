// app/api/products/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const canManage = session?.user ? await hasPermission(session, "products") : false;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const category = searchParams.get("category") || "";
    const subcategory = searchParams.get("subcategory") || "";
    const brand = searchParams.get("brand") || "";
    const status = searchParams.get("status") || "";
    const stock = searchParams.get("stock") || "";
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const featured = searchParams.get("featured");
    const noImages = searchParams.get("noImages");
    const hasVariants = searchParams.get("hasVariants");
    const tags = searchParams.get("tags");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const sort = searchParams.get("sort") || "newest";
    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
    const limit = Math.min(100, parseInt(searchParams.get("limit")) || 12);

    const query = {};

    // ===== VISIBILITY ENFORCEMENT =====
    // admin/manager = sob status dekhte parbe; otherwise sudhu public
    if (canManage) {
      if (status && ["public", "private", "draft", "unlisted"].includes(status)) query.status = status;
    } else {
      query.status = "public";
    }

    // ===== MULTI-FIELD SEARCH =====
    if (q) {
      const rx = new RegExp(escapeRegExp(q), "i");
      query.$or = [
        { name: rx },
        { brand: rx },
        { sku: rx },
        { category: rx },
        { subcategory: rx },
        { tags: rx },
        { description: rx },
      ];
    }

    if (category) query.category = new RegExp(escapeRegExp(category), "i");
    if (subcategory) query.subcategory = new RegExp(escapeRegExp(subcategory), "i");
    if (brand) query.brand = new RegExp(escapeRegExp(brand), "i");

    // ===== STOCK STATUS =====
    if (stock === "out") query.stock = { $lte: 0 };
    else if (stock === "low")
      query.$expr = { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] };
    else if (stock === "in") query.stock = { $gt: 0 };

    // ===== PRICE RANGE =====
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (featured === "1") query.featured = true;
    if (noImages === "1") query.$or = [...(query.$or || []), { images: { $exists: false } }, { images: { $eq: [] } }];
    if (hasVariants === "1") query["options.0"] = { $exists: true };
    if (tags) query.tags = { $in: tags.split(",").map((t) => t.trim()).filter(Boolean) };

    // ===== DATE RANGE =====
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + "T23:59:59");
    }

    // ===== SORTING =====
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      name: { name: 1 },
      updated: { updatedAt: -1 },
      rating: { ratingAvg: -1 },
    };

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortMap[sort] || sortMap.newest)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: { products, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) },
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