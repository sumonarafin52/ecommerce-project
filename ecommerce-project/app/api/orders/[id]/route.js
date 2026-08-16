// app/api/orders/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { hasPermission } from "@/lib/rbac";
import { isValidTransition, putOnHold, releaseHold } from "@/lib/orderStatus";
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
      // cancel korle stock fire dei
      if (orderStatus === "cancelled") {
        for (const it of order.items) {
          await Product.findByIdAndUpdate(it.product, { $inc: { stock: it.quantity } });
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
    if (["pending", "processing", "on_hold"].includes(order.orderStatus)) {
      for (const it of order.items) {
        await Product.findByIdAndUpdate(it.product, { $inc: { stock: it.quantity } });
      }
    }

    await Order.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true, message: "Order deleted" });
  } catch (error) {
    console.error("[orders:delete]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
