// app/api/shipping/carriers/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingCarrier from "@/models/ShippingCarrier";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  try {
    await connectDB();
    const carriers = await ShippingCarrier.find().sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: carriers });
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
      return NextResponse.json({ success: false, message: "Carrier name is required" }, { status: 400 });
    }
    const carrier = await ShippingCarrier.create({
      name: body.name.trim(),
      logo: body.logo || "",
      contactPerson: body.contactPerson || "",
      phone: body.phone || "",
      email: body.email || "",
      website: body.website || "",
      address: body.address || "",
      trackingUrlTemplate: body.trackingUrlTemplate || "",
      notes: body.notes || "",
      active: body.active !== false,
    });
    return NextResponse.json({ success: true, data: carrier }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
