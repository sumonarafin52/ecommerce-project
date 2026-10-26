// app/api/admin/products/performance/route.js
//
// Which products are being looked at, and which of those are being bought.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { productPerformance, needsAttention } from "@/lib/productStats";
import { serverError } from "@/lib/apiError";

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    // Either permission opens it: it is a merchandising view for whoever
    // looks after the catalogue, and a sales view for whoever reads the
    // reports.
    const allowed =
      session?.user && ((await hasPermission(session, "products")) || (await hasPermission(session, "reports")));
    if (!allowed) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parseDate = (v, fallback) => {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : fallback;
    };
    const to = parseDate(searchParams.get("to"), new Date());
    const from = parseDate(searchParams.get("from"), new Date(Date.now() - 29 * 864e5));
    const sort = searchParams.get("sort") || "views";

    const report = await productPerformance({ from, to, sort, limit: 100 });

    return NextResponse.json({
      success: true,
      data: { ...report, attention: needsAttention(report.rows).slice(0, 10), range: { from, to } },
    });
  } catch (error) {
    return serverError(error, "api/admin/products/performance");
  }
}
