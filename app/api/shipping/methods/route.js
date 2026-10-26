// app/api/shipping/methods/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingMethod from "@/models/ShippingMethod";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

// Same check the [id] routes use, so create, edit, delete and read can't
// drift apart — which is how the listings ended up public while the writes
// beside them were guarded.
async function requirePermission() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(await hasPermission(session, "settings"))) return null;
  return session;
}


// Staff only, for the same reason as the zones listing: every caller is an
// admin screen, and the storefront uses /api/shipping/quote. Open, this
// exposed the shop's rate tiers, free-shipping thresholds, COD rules and
// any method not yet switched on.
export async function GET(request) {
  try {
    await connectDB();
    if (!(await requirePermission())) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
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
    return serverError(error, "api/shipping/methods");
  }
}

export async function POST(request) {
  try {
    await connectDB();
    if (!(await requirePermission())) {
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
    return serverError(error, "api/shipping/methods");
  }
}
