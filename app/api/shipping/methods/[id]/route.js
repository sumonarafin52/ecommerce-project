// app/api/shipping/methods/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingMethod from "@/models/ShippingMethod";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

async function requirePermission() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(await hasPermission(session, "settings"))) return null;
  return session;
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    if (!(await requirePermission())) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const body = await request.json();
    const method = await ShippingMethod.findByIdAndUpdate(
      params.id,
      {
        name: body.name?.trim(),
        description: body.description || "",
        zone: body.zone,
        carrier: body.carrier || null,
        estimatedDelivery: body.estimatedDelivery || "",
        rateType: body.rateType === "weightBased" ? "weightBased" : "flat",
        flatRate: Number(body.flatRate) || 0,
        weightTiers: Array.isArray(body.weightTiers)
          ? body.weightTiers.map((t) => ({ maxWeightKg: Number(t.maxWeightKg) || 0, rate: Number(t.rate) || 0 }))
          : [],
        freeShippingThreshold: Number(body.freeShippingThreshold) || 0,
        codAllowed: body.codAllowed !== false,
        active: body.active !== false,
        order: Number(body.order) || 0,
      },
      { new: true, runValidators: true }
    );
    if (!method) return NextResponse.json({ success: false, message: "Method not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: method });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    if (!(await requirePermission())) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    await ShippingMethod.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
