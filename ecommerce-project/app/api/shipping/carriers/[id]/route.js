// app/api/shipping/carriers/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingCarrier from "@/models/ShippingCarrier";
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
    const carrier = await ShippingCarrier.findByIdAndUpdate(
      params.id,
      {
        name: body.name?.trim(),
        logo: body.logo || "",
        contactPerson: body.contactPerson || "",
        phone: body.phone || "",
        email: body.email || "",
        website: body.website || "",
        address: body.address || "",
        trackingUrlTemplate: body.trackingUrlTemplate || "",
        notes: body.notes || "",
        active: body.active !== false,
      },
      { new: true, runValidators: true }
    );
    if (!carrier) return NextResponse.json({ success: false, message: "Carrier not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: carrier });
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
    await ShippingCarrier.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
