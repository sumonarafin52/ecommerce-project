// app/api/digital-products/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import DigitalProduct from "@/models/DigitalProduct";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { buildDigitalProductFields } from "@/lib/digitalProductInput";
import { serverError } from "@/lib/apiError";

// PUT: admin — update / active toggle
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    // partial: only keys actually sent are written, so a toggle request
    // ({ active: false }) can't blank the licence terms or the file list.
    const { fields, error } = buildDigitalProductFields(body, { partial: true });
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    if (!Object.keys(fields).length) {
      return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 });
    }

    // runValidators so the "at least one file" rule and the enum on
    // licenseMode are enforced on updates too, not only on create.
    const item = await DigitalProduct.findByIdAndUpdate(params.id, fields, {
      new: true,
      runValidators: true,
    });
    if (!item) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    // Changing the policy must not retroactively change what somebody
    // already bought — existing DownloadGrants keep the limit and expiry
    // frozen at their purchase time. Only new purchases pick this up.
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    return serverError(error, "api/digital-products/[id]");
  }
}

// DELETE: admin
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const item = await DigitalProduct.findByIdAndDelete(params.id);
    if (!item) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Deleted" });
  } catch (error) {
    return serverError(error, "api/digital-products/[id]");
  }
}