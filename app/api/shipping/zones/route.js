// app/api/shipping/zones/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingZone from "@/models/ShippingZone";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET: public — checkout needs zones to compute shipping options
export async function GET() {
  try {
    await connectDB();
    const zones = await ShippingZone.find().sort({ order: 1, name: 1 }).lean();
    return NextResponse.json({ success: true, data: zones });
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
