// app/api/discounts/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Discount from "@/models/Discount";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// PUT: admin discount edit / active toggle
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "discounts"))) {
      return NextResponse.json({ success: false, message: "No permission to manage discounts" }, { status: 403 });
    }

    const body = await request.json();
    const update = {};

    if (body.code !== undefined) {
      const code = body.code.toUpperCase().trim();
      if (code.length < 3) {
        return NextResponse.json({ success: false, message: "Code must be at least 3 characters" }, { status: 400 });
      }
      const dup = await Discount.findOne({ code, _id: { $ne: params.id } });
      if (dup) {
        return NextResponse.json({ success: false, message: "This code already exists" }, { status: 400 });
      }
      update.code = code;
    }
    if (body.type !== undefined && ["percentage", "fixed"].includes(body.type)) update.type = body.type;
    if (body.value !== undefined) {
      const v = Number(body.value);
      if (update.type === "percentage" || (!update.type && body.value)) {
        // percentage hole 1-100
        const current = await Discount.findById(params.id);
        const finalType = update.type || current?.type;
        if (finalType === "percentage" && (v < 1 || v > 100)) {
          return NextResponse.json({ success: false, message: "Percentage must be between 1 and 100" }, { status: 400 });
        }
      }
      update.value = v;
    }
    if (body.scope !== undefined && ["all", "category", "product", "customer"].includes(body.scope)) update.scope = body.scope;
    if (body.target !== undefined) update.target = body.target || "";
    if (body.minAmount !== undefined) update.minAmount = Number(body.minAmount) || 0;
    if (body.usageLimit !== undefined) update.usageLimit = Number(body.usageLimit) || 0;
    if (body.active !== undefined) update.active = Boolean(body.active);
    if (body.expiresAt !== undefined) update.expiresAt = body.expiresAt || null;
    if (body.description !== undefined) update.description = body.description || "";

    const discount = await Discount.findByIdAndUpdate(params.id, update, { new: true });
    if (!discount) {
      return NextResponse.json({ success: false, message: "Discount not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: discount });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE: admin discount delete
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "discounts"))) {
      return NextResponse.json({ success: false, message: "No permission to manage discounts" }, { status: 403 });
    }

    const discount = await Discount.findByIdAndDelete(params.id);
    if (!discount) {
      return NextResponse.json({ success: false, message: "Discount not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Discount deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}