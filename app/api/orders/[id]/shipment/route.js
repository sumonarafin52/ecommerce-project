// app/api/orders/[id]/shipment/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { notify } from "@/lib/notify";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id)
      .populate("shipment.carrier", "name logo trackingUrlTemplate phone")
      .populate("shipment.method", "name estimatedDelivery");
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    const isOwner = order.user.toString() === session.user.id;
    const isStaff = await hasPermission(session, "orders");
    if (!isOwner && !isStaff) {
      return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: { orderStatus: order.orderStatus, shipment: order.shipment } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// only staff manage shipments — customers get read-only access via GET
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const body = await request.json();

    if (body.carrier !== undefined) order.shipment.carrier = body.carrier || null;
    if (body.method !== undefined) order.shipment.method = body.method || null;
    if (body.trackingNumber !== undefined) order.shipment.trackingNumber = body.trackingNumber;
    if (body.estimatedDelivery !== undefined) {
      order.shipment.estimatedDelivery = body.estimatedDelivery ? new Date(body.estimatedDelivery) : null;
    }
    if (body.notes !== undefined) order.shipment.notes = body.notes;

    if (body.addEvent?.status) {
      order.shipment.timeline.push({
        status: body.addEvent.status,
        note: body.addEvent.note || "",
        location: body.addEvent.location || "",
        at: new Date(),
      });

      // keep the coarse orderStatus in sync for the statuses both systems
      // share — everything else (in_transit, out_for_delivery, failed,
      // returned) only lives in the granular shipment timeline
      if (body.addEvent.status === "shipped" && ["pending", "processing"].includes(order.orderStatus)) {
        order.orderStatus = "shipped";
        if (!order.shippedAt) order.shippedAt = new Date();
      }
      if (body.addEvent.status === "delivered") {
        order.orderStatus = "delivered";
        if (!order.deliveredAt) order.deliveredAt = new Date();
      }

      const trackingMessages = {
        shipped: `Your order #${order.orderNumber} has shipped.`,
        in_transit: `Your order #${order.orderNumber} is in transit.`,
        out_for_delivery: `Your order #${order.orderNumber} is out for delivery.`,
        delivered: `Your order #${order.orderNumber} has been delivered.`,
        failed: `We couldn't deliver order #${order.orderNumber} — we'll be in touch about next steps.`,
        returned: `Order #${order.orderNumber} has been marked as returned.`,
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
    return NextResponse.json({ success: true, data: { orderStatus: order.orderStatus, shipment: order.shipment } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
