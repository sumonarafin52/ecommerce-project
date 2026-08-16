// app/api/discounts/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Discount from "@/models/Discount";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET ?code=XXX  → checkout e coupon validate (logged-in user)
// GET (no code)  → admin: sob discount list
export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    // coupon validation (customer)
    if (code) {
      const d = await Discount.findOne({ code: code.toUpperCase().trim() });
      if (!d) {
        return NextResponse.json({ success: false, message: "Invalid coupon code" }, { status: 404 });
      }
      if (!d.active) {
        return NextResponse.json({ success: false, message: "This coupon is no longer active" }, { status: 400 });
      }
      if (d.expiresAt && new Date(d.expiresAt) < new Date()) {
        return NextResponse.json({ success: false, message: "This coupon has expired" }, { status: 400 });
      }
      if (d.usageLimit > 0 && d.usedCount >= d.usageLimit) {
        return NextResponse.json({ success: false, message: "This coupon has reached its usage limit" }, { status: 400 });
      }
      // customer-specific coupon
      if (d.scope === "customer" && d.target !== session.user.id) {
        return NextResponse.json({ success: false, message: "This coupon is not valid for your account" }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: d });
    }

    // admin list
    if (!(await hasPermission(session, "discounts"))) {
      return NextResponse.json({ success: false, message: "No permission to manage discounts" }, { status: 403 });
    }
    const discounts = await Discount.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: discounts });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST: admin notun discount create
export async function POST(request) {
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
    const code = (body.code || "").toUpperCase().trim();

    if (!code || code.length < 3) {
      return NextResponse.json({ success: false, message: "Code must be at least 3 characters" }, { status: 400 });
    }
    if (body.type === "percentage" && (body.value < 1 || body.value > 100)) {
      return NextResponse.json({ success: false, message: "Percentage must be between 1 and 100" }, { status: 400 });
    }
    if (body.type === "fixed" && body.value < 1) {
      return NextResponse.json({ success: false, message: "Fixed amount must be at least 1" }, { status: 400 });
    }
    if ((body.scope === "category" || body.scope === "product" || body.scope === "customer") && !body.target) {
      return NextResponse.json({ success: false, message: "Target is required for this scope" }, { status: 400 });
    }

    const existing = await Discount.findOne({ code });
    if (existing) {
      return NextResponse.json({ success: false, message: "This code already exists" }, { status: 400 });
    }

    const discount = await Discount.create({
      code,
      description: body.description || "",
      type: body.type === "fixed" ? "fixed" : "percentage",
      value: Number(body.value),
      scope: ["all", "category", "product", "customer"].includes(body.scope) ? body.scope : "all",
      target: body.target || "",
      minAmount: Number(body.minAmount) || 0,
      usageLimit: Number(body.usageLimit) || 0,
      active: body.active !== false,
      expiresAt: body.expiresAt || null,
    });

    return NextResponse.json({ success: true, data: discount }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}