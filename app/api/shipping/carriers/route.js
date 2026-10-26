// app/api/shipping/carriers/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingCarrier from "@/models/ShippingCarrier";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

// Staff only. This used to be unauthenticated and returned whole documents,
// which handed anyone the carriers' contact people, internal notes — and,
// once API integrations landed, the stored credential blob. Every caller is
// an admin screen, so there was never a reason for it to be public.
export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    // `api.credentials` is excluded outright; the integration screen reads it
    // through /api/shipping/carriers/[id]/api, which masks the secrets.
    const carriers = await ShippingCarrier.find()
      .select("-api.credentials")
      .sort({ name: 1 })
      .lean();
    return NextResponse.json({ success: true, data: carriers });
  } catch (error) {
    return serverError(error, "api/shipping/carriers");
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
    return serverError(error, "api/shipping/carriers");
  }
}
