// app/api/checkout/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createRequire } from "module";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const require = createRequire(import.meta.url);
const SslCommerzPayment = require("sslcommerz-lts");

const storeId = process.env.SSLCOMMERZ_STORE_ID;
const storePass = process.env.SSLCOMMERZ_STORE_PASS || process.env.SSLCOMMERZ_STORE_PASSWORD;
const isLive = process.env.SSLCOMMERZ_IS_LIVE === "true";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await connectDB();
    const origin = new URL(request.url).origin;
    const contentType = request.headers.get("content-type") || "";

    if (!storeId || !storePass) {
      return NextResponse.json(
        { success: false, message: "SSLCommerz not configured" },
        { status: 500 }
      );
    }

    // SSLCommerz posts back here after payment (success/fail/cancel)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      const tranId = form.get("tran_id");
      const status = form.get("status");

      const order = await Order.findById(tranId);
      if (order) {
        if (status === "VALID" || status === "VALIDATED") order.paymentStatus = "paid";
        else if (status === "FAILED") order.paymentStatus = "failed";
        await order.save();
      }
      return NextResponse.redirect(`${origin}/profile?payment=${status}`);
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const { orderId } = await request.json();
    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (order.user.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Not your order" }, { status: 403 });
    }
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ success: false, message: "Order already paid" }, { status: 400 });
    }

    const sslcz = new SslCommerzPayment(storeId, storePass, isLive);
    const result = await sslcz.init({
      total_amount: order.totalAmount,
      currency: "BDT",
      tran_id: order._id.toString(),
      success_url: `${origin}/api/checkout`,
      fail_url: `${origin}/api/checkout`,
      cancel_url: `${origin}/api/checkout`,
      cus_name: order.shippingAddress.fullName,
      cus_email: session.user.email,
      cus_phone: order.shippingAddress.phone,
      cus_add1: order.shippingAddress.address,
      cus_city: order.shippingAddress.city,
      cus_country: "Bangladesh",
      shipping_method: "Courier",
      num_of_item: order.items.length,
      product_name: order.items.map((i) => i.name).join(", ").slice(0, 100),
      product_category: "Ecommerce",
      product_profile: "general",
    });

    return NextResponse.json({ success: true, data: { url: result.GatewayPageURL } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}