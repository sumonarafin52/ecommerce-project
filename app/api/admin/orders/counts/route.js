// app/api/admin/orders/counts/route.js
//
// Two numbers for the admin sidebar badge.
//
// The sidebar used to get these by downloading /api/orders — the newest 100
// orders, fully populated — and counting the array in the browser. That was
// wrong in two ways at once:
//
//   * it was wrong. /api/orders caps at 100, so on a store with 5,000 orders
//     the badge read "52 need attention" when the real figure was 2,000. The
//     number only looked plausible, which is the worst kind of wrong.
//   * it was expensive, and it ran again on every admin navigation: ~200ms
//     and a few hundred kB of order documents, to render two integers.
//
// Two counts against indexed fields instead.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

// What "needs attention" means for the badge: placed, and not yet on its way.
const NEEDS_ATTENTION = ["pending", "processing"];

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "orders"))) {
      // Not an error — staff without the orders permission simply have no
      // badge, and shouldn't be told the store's order volume either.
      return NextResponse.json({ success: true, data: { total: 0, needsAttention: 0, awaitingFulfilment: 0 } });
    }

    const [total, needsAttention, awaitingFulfilment] = await Promise.all([
      Order.estimatedDocumentCount(),
      Order.countDocuments({ orderStatus: { $in: NEEDS_ATTENTION } }),
      // Paid and still being processed — the top header's "ready to pack"
      // figure, which had the same 100-order cap.
      Order.countDocuments({ orderStatus: "processing", paymentStatus: "paid" }),
    ]);

    return NextResponse.json({ success: true, data: { total, needsAttention, awaitingFulfilment } });
  } catch (error) {
    return serverError(error, "api/admin/orders/counts");
  }
}
