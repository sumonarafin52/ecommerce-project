// app/api/orders/[id]/refund/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Records a refund against the order. This does NOT call out to
// SSLCommerz's refund API (that requires a separate merchant-approved
// refund flow and bank settlement, not a same-session reversal) — it
// records what staff processed manually/via the gateway dashboard, keeping
// the order's paymentStatus and audit trail accurate. Wiring an automatic
// gateway refund call is a clearly separable next step, not something to
// fake here.
export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (order.paymentStatus !== "paid") {
      return NextResponse.json({ success: false, message: "Only a paid order can be refunded" }, { status: 400 });
    }

    const { amount, reason } = await request.json();
    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0 || refundAmount > order.totalAmount) {
      return NextResponse.json({ success: false, message: "Enter a valid refund amount" }, { status: 400 });
    }

    order.refund = {
      amount: refundAmount,
      reason: reason || "",
      refundedAt: new Date(),
      refundedBy: session.user.name || "",
    };
    order.paymentStatus = "refunded";
    order.activity.push({
      type: "refund",
      message: `Refunded — amount recorded${reason ? `: ${reason}` : ""}`,
      by: { id: session.user.id, name: session.user.name },
      at: new Date(),
    });

    await order.save();
    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("[orders:refund]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
