// app/api/shipping/zones/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingZone from "@/models/ShippingZone";
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


// Staff only. Every caller is an admin screen — the storefront gets its
// delivery options from /api/shipping/quote, which returns what applies to
// the address being shipped to rather than the shop's whole configuration.
// Unauthenticated, this handed anyone the zone names, the regions they
// cover and the order they are shown in, including zones switched off
// because they are not launched yet.
export async function GET() {
  try {
    await connectDB();
    if (!(await requirePermission())) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const zones = await ShippingZone.find().sort({ order: 1, name: 1 }).lean();
    return NextResponse.json({ success: true, data: zones });
  } catch (error) {
    return serverError(error, "api/shipping/zones");
  }
}

export async function POST(request) {
  try {
    await connectDB();
    if (!(await requirePermission())) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, message: "Zone name is required" }, { status: 400 });
    }
    const zone = await ShippingZone.create({
      name: body.name.trim(),
      regions: Array.isArray(body.regions) ? body.regions.map((r) => r.trim()).filter(Boolean) : [],
      active: body.active !== false,
      order: Number(body.order) || 0,
    });
    return NextResponse.json({ success: true, data: zone }, { status: 201 });
  } catch (error) {
    return serverError(error, "api/shipping/zones");
  }
}
