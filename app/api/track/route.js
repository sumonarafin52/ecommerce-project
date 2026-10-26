// app/api/track/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { customerTracking } from "@/lib/customerTracking";
import { serverError } from "@/lib/apiError";

// Public tracking — no login required, but gated by knowing both the order
// number AND the phone number on the order, and rate-limited per IP so it
// can't be used to enumerate orders. Returns only shipment/status info,
// never the customer's email, full name, or account details.
export async function POST(request) {
  try {
    await connectDB();

    const ip = getClientIp(request);
    const limit = await rateLimit(`track:${ip}`, { max: 20, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many attempts. Try again shortly." }, { status: 429 });
    }

    const { orderNumber, phone } = await request.json();
    if (!orderNumber?.trim() || !phone?.trim()) {
      return NextResponse.json({ success: false, message: "Order number and phone are required" }, { status: 400 });
    }

    const order = await Order.findOne({ orderNumber: orderNumber.trim() })
      .populate("shipment.carrier", "name trackingUrlTemplate")
      .populate("shipment.method", "name estimatedDelivery")
      // Shipments created by the admin live here, not in the singular field
      // above — without this the tracking page is empty for every order
      // fulfilled through the current admin UI.
      .populate("fulfillments.carrier", "name trackingUrlTemplate");

    // same generic message whether the order or phone didn't match — don't
    // reveal which one was wrong
    if (!order || order.shippingAddress?.phone?.replace(/\s+/g, "") !== phone.trim().replace(/\s+/g, "")) {
      return NextResponse.json({ success: false, message: "No matching order found" }, { status: 404 });
    }

    const tracking = customerTracking(order);

    return NextResponse.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        city: order.shippingAddress?.city,
        ...tracking,
      },
    });
  } catch (error) {
    return serverError(error, "api/track");
  }
}
