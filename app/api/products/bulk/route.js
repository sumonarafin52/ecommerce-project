// app/api/products/bulk/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const MAX_BULK = 100;

// POST body: { action: "delete" | "duplicate" | "setStatus" | "setCategory", ids: [...], value? }
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

    const { action, ids, value } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, message: "No products selected" }, { status: 400 });
    }
    if (ids.length > MAX_BULK) {
      return NextResponse.json(
        { success: false, message: `Maximum ${MAX_BULK} products per bulk operation` },
        { status: 400 }
      );
    }

    // ===== BULK DELETE =====
    if (action === "delete") {
      const res = await Product.deleteMany({ _id: { $in: ids } });
      return NextResponse.json({ success: true, data: { affected: res.deletedCount } });
    }

    // ===== BULK STATUS CHANGE =====
    if (action === "setStatus") {
      if (!["public", "private", "draft", "unlisted"].includes(value)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      const products = await Product.find({ _id: { $in: ids } });
      for (const p of products) {
        p.status = value; // pre-save hook isActive sync korbe
        await p.save();
      }
      return NextResponse.json({ success: true, data: { affected: products.length } });
    }

    // ===== BULK CATEGORY UPDATE =====
    if (action === "setCategory") {
      if (!value || !String(value).trim()) {
        return NextResponse.json({ success: false, message: "Category name required" }, { status: 400 });
      }
      const res = await Product.updateMany({ _id: { $in: ids } }, { $set: { category: String(value).trim() } });
      return NextResponse.json({ success: true, data: { affected: res.modifiedCount } });
    }

    // ===== BULK DUPLICATE =====
    if (action === "duplicate") {
      const products = await Product.find({ _id: { $in: ids } }).lean();
      const copies = products.map((p) => ({
        ...p,
        _id: undefined,
        name: `${p.name} (Copy)`,
        sku: p.sku ? `${p.sku}-COPY` : "",
        status: "draft", // duplicate always draft — accidental publish bondho
        isActive: false,
        ratingAvg: 0,
        numReviews: 0,
        createdAt: undefined,
        updatedAt: undefined,
      }));
      const created = await Product.insertMany(copies);
      return NextResponse.json({ success: true, data: { affected: created.length } });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}