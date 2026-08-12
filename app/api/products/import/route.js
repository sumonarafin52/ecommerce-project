// app/api/products/import/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const MAX_ROWS = 500;

// GET: downloadable CSV template
export async function GET() {
  const header =
    "name,category,subcategory,brand,sku,price,discountPrice,stock,lowStockThreshold,status,tags,images,shortDescription,description";
  const example =
    "Wireless Mouse,Electronics,Accessories,Logitech,MX-100,1500,1200,25,5,public,office|wireless,https://example.com/mouse.jpg,A silent mouse,Full description here";
  return new NextResponse(`${header}\n${example}`, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=product-import-template.csv",
    },
  });
}

// POST: { rows: [...] } — validated import with error report
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

    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, message: "No rows to import" }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `Maximum ${MAX_ROWS} rows per import` },
        { status: 400 }
      );
    }

    const errors = [];
    const valid = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 1;

      // required fields
      if (!r.name || !String(r.name).trim()) {
        errors.push({ row: rowNo, message: "Name is required" });
        continue;
      }
      if (!r.category || !String(r.category).trim()) {
        errors.push({ row: rowNo, message: "Category is required" });
        continue;
      }
      const price = Number(r.price);
      if (r.price === undefined || r.price === "" || isNaN(price) || price < 0) {
        errors.push({ row: rowNo, message: "Valid price is required" });
        continue;
      }
      const discountPrice = Number(r.discountPrice) || 0;
      if (discountPrice > 0 && discountPrice >= price) {
        errors.push({ row: rowNo, message: "Discount price must be lower than price" });
        continue;
      }

      const status = ["public", "private", "draft", "unlisted"].includes(r.status) ? r.status : "public";

      // duplicate protection (sku ba name+category)
      const sku = String(r.sku || "").trim();
      let dup = null;
      if (sku) dup = await Product.findOne({ sku });
      if (!dup) dup = await Product.findOne({ name: String(r.name).trim(), category: String(r.category).trim() });
      if (dup) {
        errors.push({ row: rowNo, message: `Duplicate product (already exists: ${dup.name})` });
        continue;
      }

      valid.push({
        name: String(r.name).trim(),
        category: String(r.category).trim(),
        subcategory: String(r.subcategory || "").trim(),
        brand: String(r.brand || "").trim(),
        sku,
        price,
        discountPrice,
        stock: Number(r.stock) || 0,
        lowStockThreshold: Number(r.lowStockThreshold) || 5,
        status,
        tags: String(r.tags || "")
          .split("|")
          .map((t) => t.trim())
          .filter(Boolean),
        images: String(r.images || "")
          .split("|")
          .map((t) => t.trim())
          .filter(Boolean),
        shortDescription: String(r.shortDescription || ""),
        description: String(r.description || ""),
      });
    }

    let created = 0;
    if (valid.length) {
      await Product.insertMany(valid);
      created = valid.length;
    }

    return NextResponse.json({
      success: true,
      data: { created, failed: errors.length, errors: errors.slice(0, 50) },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}