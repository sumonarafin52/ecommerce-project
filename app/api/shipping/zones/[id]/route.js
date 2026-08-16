// app/api/shipping/zones/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

async function requirePermission() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(await hasPermission(session, "settings"))) {
    return null;
  }
  return session;
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    if (!(await requirePermission())) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const body = await request.json();
    const zone = await ShippingZone.findByIdAndUpdate(
      params.id,
      {
        name: body.name?.trim(),
        regions: Array.isArray(body.regions) ? body.regions.map((r) => r.trim()).filter(Boolean) : [],
        active: body.active !== false,
        order: Number(body.order) || 0,
      },
      { new: true, runValidators: true }
    );
    if (!zone) return NextResponse.json({ success: false, message: "Zone not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: zone });
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
    const inUse = await ShippingMethod.exists({ zone: params.id });
    if (inUse) {
      return NextResponse.json(
        { success: false, message: "Remove or reassign shipping methods using this zone first" },
        { status: 400 }
      );
    }
    await ShippingZone.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
