// app/api/categories/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Category from "@/models/Category";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// PUT: admin — category update (name, subcategories, image, order)
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const body = await request.json();
    const update = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ success: false, message: "Category name is required" }, { status: 400 });
      }
      const dup = await Category.findOne({
        name: new RegExp(`^${body.name.trim()}$`, "i"),
        _id: { $ne: params.id },
      });
      if (dup) {
        return NextResponse.json({ success: false, message: "Category already exists" }, { status: 400 });
      }
      update.name = body.name.trim();
    }
    if (body.subcategories !== undefined)
      update.subcategories = Array.isArray(body.subcategories) ? body.subcategories.map((s) => s.trim()).filter(Boolean) : [];
    if (body.image !== undefined) update.image = body.image || "";
    if (body.order !== undefined) update.order = Number(body.order) || 0;

    const category = await Category.findByIdAndUpdate(params.id, update, { new: true });
    if (!category) {
      return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE: admin — category delete
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const category = await Category.findByIdAndDelete(params.id);
    if (!category) {
      return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Category deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}