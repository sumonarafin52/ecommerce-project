// app/api/orders/[id]/refund/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getPaymentAdapter, getProviderCredentials } from "@/lib/payments";
import { rateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

// Refunds go through the provider's adapter, so this route doesn't know or
// care which gateway took the payment. The adapter answers `possible: false`
// — not an error — when automation genuinely isn't available for this order,
// and the caller then records a manual refund with the real reason shown to
// staff rather than pretending the gateway was called.
async function attemptGatewayRefund(order, amount, reason) {
  const adapter = getPaymentAdapter(order.paymentMethod);
  if (!adapter || !adapter.capabilities?.refunds) {
    return {
      possible: false,
      note: `There's no refund integration for "${order.paymentMethod}" — record the refund here and issue it from that provider directly.`,
    };
  }
  const credentials = await getProviderCredentials(order.paymentMethod);
  return adapter.refund({ order, amount, reason, credentials });
}

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const limit = await rateLimit(`refund:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many refund attempts — please wait a few minutes." }, { status: 429 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (!["paid", "refunded"].includes(order.paymentStatus)) {
      return NextResponse.json({ success: false, message: "Only a paid order can be refunded" }, { status: 400 });
    }

    const { amount, reason, method } = await request.json();
    const refundAmount = Number(amount);
    const alreadyRefunded = (order.refundHistory || []).reduce(
      (sum, r) => sum + (r.method !== "gateway_failed" ? r.amount : 0),
      0
    );
    const remaining = order.totalAmount - alreadyRefunded;
    if (!refundAmount || refundAmount <= 0 || refundAmount > remaining) {
      return NextResponse.json(
        { success: false, message: `Enter a valid refund amount (up to ${remaining} remaining)` },
        { status: 400 }
      );
    }

    // `method: "manual"` lets staff explicitly skip the gateway (e.g. they
    // already refunded through the SSLCommerz merchant panel themselves and
    // just want the order record updated) — otherwise we try the real API.
    let entry;
    if (method === "manual") {
      entry = { amount: refundAmount, reason: reason || "", method: "manual", gatewayMessage: "Recorded manually by staff.", by: session.user.name || "", at: new Date() };
    } else {
      const gw = await attemptGatewayRefund(order, refundAmount, reason);
      if (!gw.possible) {
        entry = { amount: refundAmount, reason: reason || "", method: "manual", gatewayMessage: gw.note, by: session.user.name || "", at: new Date() };
      } else if (gw.success) {
        entry = {
          amount: refundAmount,
          reason: reason || "",
          method: "gateway_pending",
          gatewayRefundRefId: gw.refundRefId,
          gatewayMessage: gw.message,
          by: session.user.name || "",
          at: new Date(),
        };
      } else {
        // gateway call was attempted but rejected — report the failure
        // rather than recording a refund that didn't actually happen
        return NextResponse.json({ success: false, message: `Gateway refund failed: ${gw.message}` }, { status: 502 });
      }
    }

    order.refundHistory = order.refundHistory || [];
    order.refundHistory.push(entry);
    order.refund = {
      amount: alreadyRefunded + refundAmount,
      reason: entry.reason,
      refundedAt: new Date(),
      refundedBy: entry.by,
      method: entry.method,
      gatewayRefundRefId: entry.gatewayRefundRefId || "",
      gatewayMessage: entry.gatewayMessage || "",
    };
    // full refund -> paymentStatus flips; partial refund keeps it "paid" so
    // the order doesn't look fully reversed when it isn't
    if (alreadyRefunded + refundAmount >= order.totalAmount) {
      order.paymentStatus = "refunded";
    }
    order.activity.push({
      type: "refund",
      message:
        entry.method === "gateway_pending"
          ? `Gateway refund initiated (${refundAmount}) — ref ${entry.gatewayRefundRefId}${reason ? `: ${reason}` : ""}`
          : `Refund recorded manually (${refundAmount})${reason ? `: ${reason}` : ""}${entry.gatewayMessage ? ` — ${entry.gatewayMessage}` : ""}`,
      by: { id: session.user.id, name: session.user.name },
      at: new Date(),
    });

    await order.save();

    await notify({
      user: order.user,
      guestEmail: order.guestEmail,
      phone: order.shippingAddress?.phone,
      type: "refund",
      title: "Refund issued",
      message: `A refund of ${formatCurrency(refundAmount)} has been issued for order #${order.orderNumber}.`,
      link: "/profile",
    });

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("[orders:refund]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// Polls SSLCommerz for the settlement status of a previously-initiated
// gateway refund and updates the stored status accordingly.
export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const order = await Order.findById(params.id);
    if (!order?.refund?.gatewayRefundRefId) {
      return NextResponse.json({ success: false, message: "No gateway refund to check for this order" }, { status: 400 });
    }

    const { storeId, storePass, isLive } = await getSslcommerzCredentials();
    if (!storeId || !storePass) {
      return NextResponse.json({ success: false, message: "SSLCommerz isn't configured" }, { status: 500 });
    }

    const sslcz = new SslCommerzPayment(storeId, storePass, isLive);
    const result = await sslcz.refundQuery({ refund_ref_id: order.refund.gatewayRefundRefId });

    const completed = result?.status === "completed" || result?.bank_status === "Refunded";
    if (completed && order.refund.method !== "gateway_completed") {
      order.refund.method = "gateway_completed";
      order.refund.gatewayMessage = result?.status || "Refund completed";
      if (order.refundHistory?.length) {
        order.refundHistory[order.refundHistory.length - 1].method = "gateway_completed";
      }
      order.activity.push({
        type: "refund",
        message: `Gateway refund settled — ref ${order.refund.gatewayRefundRefId}`,
        by: { id: session.user.id, name: session.user.name },
        at: new Date(),
      });
      await order.save();
    }

    return NextResponse.json({ success: true, data: { raw: result, refund: order.refund } });
  } catch (error) {
    console.error("[orders:refund:query]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
