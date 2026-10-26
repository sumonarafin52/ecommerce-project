// app/api/digital-products/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import DigitalProduct from "@/models/DigitalProduct";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { buildDigitalProductFields } from "@/lib/digitalProductInput";
import { serverError } from "@/lib/apiError";

// GET: admin — sob digital product list
export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const items = await DigitalProduct.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return serverError(error, "api/digital-products");
  }
}

// POST: admin — notun digital product create
export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    // Validation, clamping and the storage-host check all live in
    // lib/digitalProductInput so create and update can't accept different
    // field sets — which is how the new fields (download limit, expiry,
    // licence, versions, extra files) used to get silently dropped.
    const body = await request.json().catch(() => ({}));
    const { fields, error } = buildDigitalProductFields(body);
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }

    const item = await DigitalProduct.create(fields);

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    return serverError(error, "api/digital-products");
  }
}