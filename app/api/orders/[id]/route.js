// app/api/orders/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Discount from "@/models/Discount";
import { hasPermission } from "@/lib/rbac";
import { isValidTransition, putOnHold, releaseHold, ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { notify } from "@/lib/notify";
import { adjustStock } from "@/lib/productStock";
import { notifyBackInStock } from "@/lib/inventoryEvents";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

function pushActivity(order, type, message, session) {
  order.activity.push({
    type,
    message,
    by: { id: session?.user?.id || null, name: session?.user?.name || "System" },
    at: new Date(),
  });
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id)
      .populate("user", "name email")
      .populate("fulfillments.carrier", "name logo trackingUrlTemplate phone")
      .populate("fulfillments.method", "name estimatedDelivery")
      .populate("shipment.carrier", "name logo trackingUrlTemplate phone")
      .populate("shipment.method", "name estimatedDelivery");
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const isOwner = order.user._id.toString() === session.user.id;
    const isStaff = await hasPermission(session, "orders");
    if (!isOwner && !isStaff) {
      return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("[orders:get]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const body = await request.json();
    const isOwner = order.user.toString() === session.user.id;

    // ===== CUSTOMER: confirm receipt (fulfill) =====
    if (body.confirmReceipt) {
      if (!isOwner) {
        return NextResponse.json({ success: false, message: "Not your order" }, { status: 403 });
      }
      if (order.orderStatus !== "shipped") {
        return NextResponse.json({ success: false, message: "Order is not shipped yet" }, { status: 400 });
      }
      order.orderStatus = "delivered";
      order.deliveredAt = new Date();
      pushActivity(order, "status_changed", "Customer confirmed delivery", session);
      await order.save();
      return NextResponse.json({ success: true, data: order });
    }

    // ===== CUSTOMER: cancel before it ships =====
    if (body.cancelByCustomer) {
      if (!isOwner) {
        return NextResponse.json({ success: false, message: "Not your order" }, { status: 403 });
      }
      if (!["pending", "processing", "on_hold"].includes(order.orderStatus)) {
        return NextResponse.json(
          { success: false, message: "This order has already shipped or been closed, so it can't be cancelled." },
          { status: 400 }
        );
      }
      if (order.fulfillments?.length) {
        return NextResponse.json(
          { success: false, message: "Part of this order is already on its way — please contact support to cancel." },
          { status: 400 }
        );
      }
      // Money has been taken: cancelling needs a refund, which staff handle.
      // Self-cancelling here would leave the customer's payment in limbo.
      if (order.paymentStatus === "paid") {
        return NextResponse.json(
          { success: false, message: "This order is already paid — please contact support and we'll cancel and refund it." },
          { status: 400 }
        );
      }

      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      if (!order.stockReleased) {
        await adjustStock(order.items, 1);
        order.stockReleased = true;
        for (const it of order.items) notifyBackInStock(it.product);
      }
      if (order.discountCode) {
        await Discount.updateOne({ code: order.discountCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
      }
      pushActivity(order, "status_changed", `Customer cancelled the order${reason ? `: ${reason}` : ""}`, session);
      order.orderStatus = "cancelled";
      order.previousStatus = undefined;
      order.holdReason = "";
      await order.save();

      const admins = await User.find({ role: "admin" }).select("_id").lean();
      for (const a of admins) {
        notify({
          user: a._id,
          type: "order_status",
          title: "Order cancelled by customer",
          message: `Order #${order.orderNumber} was cancelled by the customer${reason ? ` — "${reason}"` : ""}.`,
          link: `/admin/orders/${order._id}`,
        });
      }
      return NextResponse.json({ success: true, data: order });
    }

    // ===== STAFF: status / address / hold updates =====
    if (!(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { orderStatus, paymentStatus, onHold, holdReason, shippingAddress } = body;

    if (orderStatus && orderStatus !== order.orderStatus) {
      if (!isValidTransition(order.orderStatus, orderStatus)) {
        return NextResponse.json(
          { success: false, message: `Cannot move an order from "${order.orderStatus}" to "${orderStatus}"` },
          { status: 400 }
        );
      }
      if (orderStatus === "shipped" && !order.shippedAt) order.shippedAt = new Date();
      if (orderStatus === "delivered" && !order.deliveredAt) order.deliveredAt = new Date();
      // cancel korle stock fire dei — but only if this order is still
      // holding its stock. A failed online payment already releases it
      // (see app/api/checkout/route.js), so without this guard cancelling
      // an already-failed order would credit the same units back twice.
      if (orderStatus === "cancelled" && !order.stockReleased) {
        await adjustStock(order.items, 1);
        order.stockReleased = true;
        // returned stock may satisfy customers waiting on these items
        for (const it of order.items) notifyBackInStock(it.product);
        // Give the coupon slot back too — every other cancellation path
        // (customer cancel, failed payment) already does. Without this a
        // limited coupon permanently lost a use each time staff cancelled.
        if (order.discountCode) {
          await Discount.updateOne({ code: order.discountCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
        }
      }
      pushActivity(order, "status_changed", `Order status changed from "${order.orderStatus}" to "${orderStatus}"`, session);
      order.orderStatus = orderStatus;
      // moving away from "on_hold" directly (rather than via onHold:false
      // below) — clear the now-stale hold bookkeeping
      if (orderStatus !== "on_hold") {
        order.previousStatus = undefined;
        order.holdReason = "";
      }

      const statusMessages = {
        processing: `Your order #${order.orderNumber} is now being processed.`,
        shipped: `Your order #${order.orderNumber} has shipped and is on its way.`,
        delivered: `Your order #${order.orderNumber} has been delivered. We hope you love it!`,
        cancelled: `Your order #${order.orderNumber} was cancelled.`,
        on_hold: `Your order #${order.orderNumber} is on hold — we'll be in touch.`,
        returned: `Your order #${order.orderNumber} was marked as returned.`,
      };
      if (statusMessages[orderStatus]) {
        await notify({
          user: order.user,
          type: "order_status",
          title: `Order ${ORDER_STATUS_LABELS[orderStatus] || orderStatus}`,
          message: statusMessages[orderStatus],
          link: "/profile",
        });
      }
    }

    if (paymentStatus && paymentStatus !== order.paymentStatus) {
      pushActivity(order, "payment_status_changed", `Payment status changed from "${order.paymentStatus}" to "${paymentStatus}"`, session);
      order.paymentStatus = paymentStatus;
    }

    // Kept as a boolean over the wire for a minimal frontend diff, but
    // internally now drives orderStatus="on_hold" + previousStatus (see
    // lib/orderStatus.js) instead of a standalone flag that could drift out
    // of sync with the real pipeline stage.
    if (typeof onHold === "boolean") {
      const isCurrentlyOnHold = order.orderStatus === "on_hold";
      if (onHold && !isCurrentlyOnHold) {
        putOnHold(order, holdReason);
        pushActivity(order, "hold", `Order put on hold${holdReason ? ": " + holdReason : ""}`, session);
      } else if (!onHold && isCurrentlyOnHold) {
        releaseHold(order);
        pushActivity(order, "hold_released", "Hold released", session);
      }
    }

    if (shippingAddress && typeof shippingAddress === "object") {
      const next = {
        fullName: shippingAddress.fullName?.trim() || order.shippingAddress.fullName,
        phone: shippingAddress.phone?.trim() || order.shippingAddress.phone,
        address: shippingAddress.address?.trim() || order.shippingAddress.address,
        city: shippingAddress.city?.trim() || order.shippingAddress.city,
      };
      const changed = JSON.stringify(next) !== JSON.stringify(order.shippingAddress.toObject?.() ?? order.shippingAddress);
      if (changed) {
        order.shippingAddress = next;
        pushActivity(order, "address_changed", "Shipping address updated", session);
      }
    }

    await order.save();
    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("[orders:update]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// ===== ADMIN: delete order (bulk delete supported from client) =====
export async function DELETE(request, { params }) {
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

    // Paid orders (and anything with refund history) are financial records
    // — deleting one permanently erases that trail with no way to recover
    // it. Cancel or refund it instead; deletion stays available for
    // cleaning up junk/duplicate orders that never had money move.
    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded" || order.refundHistory?.length) {
      return NextResponse.json(
        { success: false, message: "This order has payment history and can't be deleted — cancel or refund it instead." },
        { status: 400 }
      );
    }

    // stock fire dei sudhu jodi order ekhono shipped na hoy
    // cancelled order er stock age thekei return kora, delivered mane product chole geche
    // stockReleased check: a failed online payment already returned this
    // order's stock, so restoring again here would double-credit it.
    if (["pending", "processing", "on_hold"].includes(order.orderStatus) && !order.stockReleased) {
      await adjustStock(order.items, 1);
    }

    await Order.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true, message: "Order deleted" });
  } catch (error) {
    console.error("[orders:delete]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
