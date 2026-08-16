// app/api/orders/[id]/refund/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { SslCommerzPayment, getSslcommerzCredentials } from "@/lib/sslcommerz";
import { rateLimit } from "@/lib/rateLimit";

// Attempts a real SSLCommerz refund. Returns { possible: false } (not a
// thrown error) if automation genuinely isn't possible for this order — the
// caller falls back to a manual record in that case, with the reason
// surfaced to staff rather than silently pretending the gateway was called.
async function attemptGatewayRefund(order, amount, reason) {
  if (order.paymentMethod !== "sslcommerz") {
    return { possible: false, note: "This order wasn't paid via SSLCommerz — no gateway to call." };
  }
  if (!order.bankTranId) {
    return {
      possible: false,
      note: "No bank transaction id on file for this order (payment may predate this feature, or wasn't verified) — refund must be issued manually via the SSLCommerz merchant panel.",
    };
  }

  const { storeId, storePass, isLive } = await getSslcommerzCredentials();
  if (!storeId || !storePass) {
    return { possible: false, note: "SSLCommerz isn't configured (Settings → Payment Methods) — cannot call the refund API." };
  }

  try {
    const sslcz = new SslCommerzPayment(storeId, storePass, isLive);
    const result = await sslcz.initiateRefund({
      refund_amount: amount,
      refund_remarks: reason || "Refund issued via admin panel",
      bank_tran_id: order.bankTranId,
      refe_id: order._id.toString(),
    });

    // SSLCommerz's refund API responds with APIConnect: "DONE" once the
    // refund request itself was accepted (settlement is asynchronous after
    // that — refund_ref_id is what refundQuery can later poll).
    if (result?.APIConnect === "DONE" && result?.refund_ref_id) {
      return {
        possible: true,
        success: true,
        status: "gateway_pending",
        refundRefId: result.refund_ref_id,
        message: result.errorReason || "Refund initiated with SSLCommerz — settlement is processed by the gateway.",
      };
    }

    return {
      possible: true,
      success: false,
      status: "gateway_failed",
      message: result?.errorReason || result?.APIConnect || "SSLCommerz rejected the refund request.",
    };
  } catch (err) {
    return { possible: true, success: false, status: "gateway_failed", message: err.message || "SSLCommerz refund API call failed." };
  }
}

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const limit = rateLimit(`refund:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
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
