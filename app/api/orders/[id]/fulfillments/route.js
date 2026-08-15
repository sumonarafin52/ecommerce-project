// app/api/orders/[id]/fulfillments/route.js
// Partial/multi-shipment fulfillment — an order can have several of these,
// each covering some subset of the order's items. See lib/orderStatus.js
// for how overall fulfillment status is derived from these.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { remainingItemsToFulfill } from "@/lib/orderStatus";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

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
    if (order.orderStatus === "cancelled") {
      return NextResponse.json({ success: false, message: "Cannot fulfill a cancelled order" }, { status: 400 });
    }

    const body = await request.json();
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!requestedItems.length) {
      return NextResponse.json({ success: false, message: "Select at least one item to fulfill" }, { status: 400 });
    }

    // validate against what's actually still unfulfilled — never trust the
    // client's quantities blindly
    const remaining = remainingItemsToFulfill(order);
    const remainingMap = new Map(remaining.map((r) => [r.product, r]));
    const fulfillItems = [];
    for (const req of requestedItems) {
      const key = String(req.product);
      const avail = remainingMap.get(key);
      const qty = Number(req.quantity) || 0;
      if (!avail || qty <= 0) continue;
      if (qty > avail.remaining) {
        return NextResponse.json(
          { success: false, message: `Cannot fulfill ${qty} of "${avail.name}" — only ${avail.remaining} remaining` },
          { status: 400 }
        );
      }
      fulfillItems.push({ product: req.product, name: avail.name, quantity: qty });
    }
    if (!fulfillItems.length) {
      return NextResponse.json({ success: false, message: "Nothing valid to fulfill" }, { status: 400 });
    }

    const fulfillment = {
      items: fulfillItems,
      carrier: body.carrier || null,
      method: body.method || null,
      trackingNumber: body.trackingNumber || "",
      status: body.trackingNumber ? "shipped" : "pending",
      estimatedDelivery: body.estimatedDelivery ? new Date(body.estimatedDelivery) : null,
      notes: body.notes || "",
      timeline: body.trackingNumber
        ? [{ status: "shipped", note: "Shipment created", at: new Date() }]
        : [],
    };
    order.fulfillments.push(fulfillment);

    const itemSummary = fulfillItems.map((i) => `${i.name} ×${i.quantity}`).join(", ");
    order.activity.push({
      type: "shipment_created",
      message: `Shipment created for: ${itemSummary}`,
      by: { id: session.user.id, name: session.user.name },
      at: new Date(),
    });

    await order.save();
    const saved = await Order.findById(order._id)
      .populate("fulfillments.carrier", "name logo trackingUrlTemplate phone")
      .populate("fulfillments.method", "name estimatedDelivery");

    return NextResponse.json({ success: true, data: saved.fulfillments[saved.fulfillments.length - 1] }, { status: 201 });
  } catch (error) {
    console.error("[fulfillments:create]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
