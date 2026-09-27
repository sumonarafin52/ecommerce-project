// app/api/returns/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import User from "@/models/User";
import ReturnRequest, { RETURN_WINDOW_DAYS, RETURN_REASONS } from "@/models/ReturnRequest";
import { hasPermission } from "@/lib/rbac";
import { rateLimit } from "@/lib/rateLimit";
import { isValidQuantity } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const lineKey = (product, combinationKey) => `${product}::${combinationKey || ""}`;

// GET — customers see their own requests; staff with "orders" see all
export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    const isStaff = await hasPermission(session, "orders");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const query = isStaff && searchParams.get("scope") === "all" ? {} : { user: session.user.id };
    if (status && ["requested", "approved", "rejected", "received", "refunded"].includes(status)) query.status = status;

    let finder = ReturnRequest.find(query).sort({ createdAt: -1 }).limit(200);
    if (isStaff) finder = finder.populate("user", "name email");
    const returns = await finder.lean();
    return NextResponse.json({ success: true, data: returns });
  } catch (error) {
    console.error("[returns:get]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// POST { orderId, items: [{ product, combinationKey, quantity }], reason, details }
export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    const limit = await rateLimit(`return-create:${session.user.id}`, { max: 10, windowMs: 60 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many requests — please try again later." }, { status: 429 });
    }

    const { orderId, items, reason, details = "" } = (await request.json()) || {};

    if (typeof orderId !== "string" || !/^[0-9a-fA-F]{24}$/.test(orderId)) {
      return NextResponse.json({ success: false, message: "Invalid order" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Choose at least one item to return" }, { status: 400 });
    }
    if (!Object.prototype.hasOwnProperty.call(RETURN_REASONS, reason)) {
      return NextResponse.json({ success: false, message: "Please choose a reason" }, { status: 400 });
    }
    if (typeof details !== "string" || details.length > 1000) {
      return NextResponse.json({ success: false, message: "Details must be under 1000 characters" }, { status: 400 });
    }
    for (const it of items) {
      if (!it || typeof it.product !== "string" || !isValidQuantity(it.quantity)) {
        return NextResponse.json({ success: false, message: "Invalid item or quantity" }, { status: 400 });
      }
    }

    const order = await Order.findById(orderId);
    // "not found" rather than "forbidden" for someone else's order, so ids
    // can't be probed
    if (!order || String(order.user) !== session.user.id) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (order.orderStatus !== "delivered") {
      return NextResponse.json({ success: false, message: "Returns can only be requested once an order is delivered" }, { status: 400 });
    }
    const deliveredAt = order.deliveredAt || order.updatedAt;
    const windowEnds = new Date(new Date(deliveredAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnds) {
      return NextResponse.json(
        { success: false, message: `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed` },
        { status: 400 }
      );
    }

    // quantity already covered by other non-rejected requests on this order
    const existing = await ReturnRequest.find({ order: order._id, status: { $ne: "rejected" } }).lean();
    const alreadyRequested = new Map();
    for (const r of existing) {
      for (const it of r.items) {
        const k = lineKey(it.product, it.combinationKey);
        alreadyRequested.set(k, (alreadyRequested.get(k) || 0) + it.quantity);
      }
    }

    const returnItems = [];
    for (const it of items) {
      const combinationKey = it.combinationKey || "";
      const orderLine = order.items.find(
        (l) => String(l.product) === it.product && (l.combinationKey || "") === combinationKey
      );
      if (!orderLine) {
        return NextResponse.json({ success: false, message: "One of those items isn't in this order" }, { status: 400 });
      }
      const remaining = orderLine.quantity - (alreadyRequested.get(lineKey(it.product, combinationKey)) || 0);
      if (it.quantity > remaining) {
        return NextResponse.json(
          {
            success: false,
            message:
              remaining > 0
                ? `You can return at most ${remaining} of ${orderLine.name}`
                : `${orderLine.name} already has a return in progress`,
          },
          { status: 400 }
        );
      }
      returnItems.push({
        product: orderLine.product,
        combinationKey,
        name: orderLine.name,
        quantity: it.quantity,
        price: orderLine.price, // price actually paid — never from the client
      });
    }

    const created = await ReturnRequest.create({
      order: order._id,
      orderNumber: order.orderNumber,
      user: session.user.id,
      items: returnItems,
      reason,
      details: details.trim(),
      refundAmount: returnItems.reduce((s, i) => s + i.price * i.quantity, 0),
      history: [{ status: "requested", note: RETURN_REASONS[reason], by: session.user.name || "Customer" }],
    });

    order.activity.push({
      type: "return_requested",
      message: `Customer requested a return (${RETURN_REASONS[reason]})`,
      by: { id: session.user.id, name: session.user.name },
      at: new Date(),
    });
    await order.save();

    // let the admins know there's something to review
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const a of admins) {
      notify({
        user: a._id,
        type: "return",
        title: "New return request",
        message: `Return requested on order #${order.orderNumber} — ${RETURN_REASONS[reason]}.`,
        link: "/admin/returns",
      });
    }

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[returns:create]", error);
    return NextResponse.json({ success: false, message: "Couldn't submit your return request" }, { status: 500 });
  }
}
