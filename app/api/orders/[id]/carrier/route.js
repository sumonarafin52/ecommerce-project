// app/api/orders/[id]/carrier/route.js
//
// Book a parcel with the courier, or ask it where that parcel is.
//
// It acts on one fulfillment, not on the order, because an order can ship in
// parts and each box is a separate consignment with its own tracking number.
//
// Both actions go through the carrier's adapter, so this route has no idea
// which courier it's talking to — and for a courier with no API (the usual
// case) the adapter reports `booking: false` and this refuses clearly instead
// of pretending something happened.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import ShippingCarrier from "@/models/ShippingCarrier";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { adapterForCarrier } from "@/lib/carriers";
import { timelineStatusFor } from "@/lib/carriers/adapter";
import { notify } from "@/lib/notify";
import { serverError } from "@/lib/apiError";

const ACTIONS = ["book", "refreshStatus"];
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ""));

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const body = (await request.json()) || {};
    const action = ACTIONS.includes(body.action) ? body.action : "";
    if (!action) {
      return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // Which parcel. An order with exactly one shipment doesn't need to say.
    const fulfillments = order.fulfillments || [];
    if (!fulfillments.length) {
      return NextResponse.json(
        { success: false, message: "Create a shipment for this order first." },
        { status: 400 }
      );
    }
    const fulfillment = body.fulfillmentId
      ? fulfillments.id(body.fulfillmentId)
      : fulfillments.length === 1
      ? fulfillments[0]
      : null;
    if (!fulfillment) {
      return NextResponse.json(
        {
          success: false,
          message: body.fulfillmentId
            ? "That shipment no longer exists."
            : "This order has several shipments — say which one.",
        },
        { status: body.fulfillmentId ? 404 : 400 }
      );
    }

    if (!fulfillment.carrier) {
      return NextResponse.json(
        { success: false, message: "Choose a carrier for this shipment first." },
        { status: 400 }
      );
    }
    const carrier = await ShippingCarrier.findById(fulfillment.carrier).lean();
    if (!carrier) {
      return NextResponse.json({ success: false, message: "That carrier no longer exists." }, { status: 404 });
    }

    const { adapter, credentials } = adapterForCarrier(carrier);

    // ---- book a consignment --------------------------------------------
    if (action === "book") {
      if (!adapter.capabilities?.booking) {
        return NextResponse.json(
          {
            success: false,
            message: `${carrier.name} has no booking integration — book it with the courier and enter the tracking number here.`,
          },
          { status: 400 }
        );
      }
      // Booking twice would put a second parcel on the road for one box.
      if (fulfillment.consignmentId) {
        return NextResponse.json(
          { success: false, message: `Already booked with ${carrier.name} (${fulfillment.consignmentId}).` },
          { status: 409 }
        );
      }

      const result = await adapter.book({
        order,
        // Only this parcel's contents, not the whole order — the courier is
        // collecting one box.
        items: fulfillment.items,
        creds: credentials,
        note: typeof body.note === "string" ? body.note.slice(0, 300) : "",
      });
      if (!result.ok) {
        return NextResponse.json({ success: false, message: result.error }, { status: 502 });
      }

      fulfillment.consignmentId = result.consignmentId || "";
      fulfillment.trackingNumber = result.trackingNumber || fulfillment.trackingNumber;
      fulfillment.bookedWith = adapter.id;
      fulfillment.bookedAt = new Date();
      // The courier speaks in parcel statuses; the timeline speaks to the
      // customer. A booked-but-uncollected parcel is "processing" to them.
      const bookedStatus = timelineStatusFor(result.status) || "processing";
      fulfillment.timeline.push({ status: bookedStatus, note: `Booked with ${carrier.name}`, at: new Date() });
      order.activity.push({
        type: "shipment_created",
        message: `Consignment booked with ${carrier.name} — ${result.trackingNumber || result.consignmentId}`,
        by: { id: session.user.id, name: session.user.name || "Staff" },
        at: new Date(),
      });
      await order.save();

      await notifyCustomer(order, "Your order has been handed to the courier");

      return NextResponse.json({
        success: true,
        message: `Booked with ${carrier.name}.`,
        data: { consignmentId: fulfillment.consignmentId, trackingNumber: fulfillment.trackingNumber },
      });
    }

    // ---- ask the courier where it is -----------------------------------
    if (!adapter.capabilities?.statusFetch) {
      return NextResponse.json(
        { success: false, message: `${carrier.name} can't be queried for status — update the timeline by hand.` },
        { status: 400 }
      );
    }
    if (!fulfillment.consignmentId && !fulfillment.trackingNumber) {
      return NextResponse.json({ success: false, message: "No tracking number on this shipment yet." }, { status: 400 });
    }

    const result = await adapter.fetchStatus({
      consignmentId: fulfillment.consignmentId,
      trackingNumber: fulfillment.trackingNumber,
      creds: credentials,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 502 });
    }

    fulfillment.lastStatusCheckAt = new Date();

    // An unrecognised status is reported, not guessed at: a wrong status on
    // the customer's tracking page is worse than a stale one. The same goes
    // for a status an adapter normalised to something outside our vocabulary.
    const timelineStatus = timelineStatusFor(result.status);
    if (!result.status || !timelineStatus) {
      await order.save();
      return NextResponse.json({
        success: true,
        message: `${carrier.name} says "${result.rawStatus}", which doesn't map to a known status. Update the timeline by hand.`,
        data: { rawStatus: result.rawStatus, changed: false },
      });
    }

    if (fulfillment.timeline.at(-1)?.status === timelineStatus) {
      await order.save();
      return NextResponse.json({
        success: true,
        message: `No change — still "${result.status}".`,
        data: { status: result.status, changed: false },
      });
    }

    // Adapters report events in courier vocabulary; translate each one rather
    // than trusting it to fit the timeline's schema.
    const events = (result.events?.length ? result.events : [{ status: result.status, at: new Date() }])
      .map((ev) => ({ ...ev, status: timelineStatusFor(ev.status) }))
      .filter((ev) => ev.status);
    if (!events.length) events.push({ status: timelineStatus, at: new Date() });
    fulfillment.timeline.push(...events);
    fulfillment.status = fulfillmentStatusFor(timelineStatus);

    rollUpOrderStatus(order);
    await order.save();

    await notifyCustomer(order, statusMessage(result.status, carrier.name));

    return NextResponse.json({
      success: true,
      message: `Updated to "${result.status}".`,
      data: { status: result.status, changed: true },
    });
  } catch (error) {
    return serverError(error, "api/orders/carrier");
  }
}

/** The fulfillment's own status field has no "processing" — that's pre-pickup. */
function fulfillmentStatusFor(timelineStatus) {
  return timelineStatus === "processing" || timelineStatus === "confirmed" ? "pending" : timelineStatus;
}

/**
 * The order is only as far along as its least advanced parcel: a two-box
 * order isn't delivered until both boxes are.
 */
function rollUpOrderStatus(order) {
  const parcels = order.fulfillments || [];
  if (!parcels.length) return;

  const everythingShipped = (order.items || []).every((item) => {
    const needed = item.quantity || 0;
    const done = parcels.reduce((sum, f) => {
      const line = (f.items || []).find((it) => String(it.product) === String(item.product));
      return sum + (line?.quantity || 0);
    }, 0);
    return done >= needed;
  });
  if (!everythingShipped) return; // part of the order hasn't left yet

  if (parcels.every((f) => f.status === "delivered")) {
    if (order.orderStatus !== "delivered") {
      order.orderStatus = "delivered";
      order.deliveredAt = new Date();
    }
    return;
  }
  if (
    parcels.some((f) => ["shipped", "in_transit", "out_for_delivery"].includes(f.status)) &&
    ["pending", "processing"].includes(order.orderStatus)
  ) {
    order.orderStatus = "shipped";
    order.shippedAt = order.shippedAt || new Date();
  }
}

function statusMessage(status, carrierName) {
  return (
    {
      picked_up: `${carrierName} has collected your parcel.`,
      in_transit: "Your parcel is on its way.",
      out_for_delivery: "Your parcel is out for delivery today.",
      delivered: "Your order has been delivered.",
      failed: "Delivery was attempted but didn't succeed. We'll be in touch.",
      returned: "Your parcel is on its way back to us.",
      cancelled: "The delivery was cancelled.",
    }[status] || "There's an update on your delivery."
  );
}

/** Tells the customer, through whichever channels the store has enabled. */
async function notifyCustomer(order, message) {
  try {
    // A guest has no account to sign into, so they get the public tracking
    // page instead of their profile.
    const link = order.user ? "/profile" : `/track?order=${encodeURIComponent(order.orderNumber)}`;
    await notify({
      user: order.user,
      guestEmail: order.guestEmail,
      phone: order.shippingAddress?.phone,
      type: "shipment",
      title: `Order ${order.orderNumber} — delivery update`,
      message,
      link,
      linkLabel: "Track your order",
    });
  } catch {
    // a notification must never fail the shipment update around it
  }
}
