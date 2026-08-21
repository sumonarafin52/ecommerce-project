// app/api/orders/[id]/fulfillments/[fulfillmentId]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { notify } from "@/lib/notify";

// Update one shipment's carrier/tracking/status, or append a new tracking
// timeline event to it (mirrors the pattern already used by the legacy
// single-shipment endpoint at /api/orders/[id]/shipment).
export async function PUT(request, { params }) {
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
    const fulfillment = order.fulfillments.id(params.fulfillmentId);
    if (!fulfillment) {
      return NextResponse.json({ success: false, message: "Shipment not found" }, { status: 404 });
    }

    const body = await request.json();

    if (body.carrier !== undefined) fulfillment.carrier = body.carrier || null;
    if (body.method !== undefined) fulfillment.method = body.method || null;
    if (body.trackingNumber !== undefined) fulfillment.trackingNumber = body.trackingNumber;
    if (body.estimatedDelivery !== undefined) {
      fulfillment.estimatedDelivery = body.estimatedDelivery ? new Date(body.estimatedDelivery) : null;
    }
    if (body.notes !== undefined) fulfillment.notes = body.notes;

    if (body.addEvent?.status) {
      fulfillment.timeline.push({
        status: body.addEvent.status,
        note: body.addEvent.note || "",
        location: body.addEvent.location || "",
        at: new Date(),
      });
      fulfillment.status = body.addEvent.status;

      order.activity.push({
        type: "shipment_status_updated",
        message: `Shipment status updated to "${body.addEvent.status}"${body.addEvent.location ? ` (${body.addEvent.location})` : ""}`,
        by: { id: session.user.id, name: session.user.name },
        at: new Date(),
      });

      // keep the coarse orderStatus in sync when every fulfillment agrees —
      // mirrors the same "sync where it makes sense" approach already used
      // by the legacy shipment endpoint
      const allDelivered = order.fulfillments.every((f) => f.status === "delivered");
      if (body.addEvent.status === "shipped" && ["pending", "processing"].includes(order.orderStatus)) {
        order.orderStatus = "shipped";
        if (!order.shippedAt) order.shippedAt = new Date();
      }
      if (allDelivered && order.orderStatus === "shipped") {
        order.orderStatus = "delivered";
        if (!order.deliveredAt) order.deliveredAt = new Date();
      }

      const trackingMessages = {
        shipped: `A shipment for order #${order.orderNumber} is on its way.`,
        in_transit: `A shipment for order #${order.orderNumber} is in transit.`,
        out_for_delivery: `A shipment for order #${order.orderNumber} is out for delivery.`,
        delivered: `A shipment for order #${order.orderNumber} has been delivered.`,
        failed: `We couldn't deliver part of order #${order.orderNumber} — we'll be in touch about next steps.`,
        returned: `Part of order #${order.orderNumber} has been marked as returned.`,
      };
      if (trackingMessages[body.addEvent.status]) {
        await notify({
          user: order.user,
          type: "shipment",
          title: "Delivery update",
          message: trackingMessages[body.addEvent.status],
          link: "/profile",
        });
      }
    }

    await order.save();
    const saved = await Order.findById(order._id)
      .populate("fulfillments.carrier", "name logo trackingUrlTemplate phone")
      .populate("fulfillments.method", "name estimatedDelivery");
    const updated = saved.fulfillments.id(params.fulfillmentId);

    return NextResponse.json({ success: true, data: { fulfillment: updated, orderStatus: saved.orderStatus } });
  } catch (error) {
    console.error("[fulfillments:update]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
