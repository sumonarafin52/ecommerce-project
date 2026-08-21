// app/api/categories/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Category from "@/models/Category";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET: public — sob category + subcategory (dropdown er jonno)
export async function GET() {
  try {
    await connectDB();
    const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST: admin — notun category create
export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { name, subcategories, image, order } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, message: "Category name is required" }, { status: 400 });
    }

    const existing = await Category.findOne({ name: new RegExp(`^${name.trim()}$`, "i") });
    if (existing) {
      return NextResponse.json({ success: false, message: "Category already exists" }, { status: 400 });
    }

    const category = await Category.create({
      name: name.trim(),
      subcategories: Array.isArray(subcategories) ? subcategories.map((s) => s.trim()).filter(Boolean) : [],
      image: image || "",
      order: Number(order) || 0,
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}