// app/api/shipping/methods/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingMethod from "@/models/ShippingMethod";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET: public — checkout needs this to show available methods/rates
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const zone = searchParams.get("zone");
    const filter = zone ? { zone } : {};
    const methods = await ShippingMethod.find(filter)
      .sort({ order: 1, name: 1 })
      .populate("zone", "name")
      .populate("carrier", "name logo")
      .lean();
    return NextResponse.json({ success: true, data: methods });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const body = await request.json();
    if (!body.name?.trim() || !body.zone) {
      return NextResponse.json({ success: false, message: "Name and zone are required" }, { status: 400 });
    }
    const method = await ShippingMethod.create({
      name: body.name.trim(),
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
    });
    return NextResponse.json({ success: true, data: method }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
