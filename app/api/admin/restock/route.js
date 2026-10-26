// app/api/admin/restock/route.js
//
// What needs reordering, worst first.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { restockList, VELOCITY_WINDOW_DAYS, TARGET_COVER_DAYS } from "@/lib/restock";
import { serverError } from "@/lib/apiError";

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clamp = (value, fallback, min, max) => {
      const n = parseInt(value);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };

    const data = await restockList({
      days: clamp(searchParams.get("days"), VELOCITY_WINDOW_DAYS, 7, 180),
      targetDays: clamp(searchParams.get("target"), TARGET_COVER_DAYS, 7, 120),
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, "api/admin/restock");
  }
}
