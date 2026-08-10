import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import SslCommerzPayment from "sslcommerz-lts";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const storeId = process.env.SSLCOMMERZ_STORE_ID || "";
const storePass = process.env.SSLCOMMERZ_STORE_PASS || "";
const isLive = process.env.SSLCOMMERZ_IS_LIVE === "true";

// ✅ Removed the throw error check from here - will validate at runtime

export async function POST(request) {
  try {
    await connectDB();
    const origin = new URL(request.url).origin;
    const contentType = request.headers.get("content-type") || "";

    // Handle SSLCommerz callback (form-encoded POST after payment)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const tranId = formData.get("tran_id");
      const status = formData.get("status");
      const validationId = formData.get("validation_id");

      if (!tranId || !status) {
        return NextResponse.redirect(`${origin}/checkout?error=invalid_callback`);
      }

      const order = await Order.findById(tranId);

      if (!order) {
        console.error(`Order not found for tranId: ${tranId}`);
        return NextResponse.redirect(`${origin}/checkout?error=order_not_found`);
      }

      // Update order payment status based on SSLCommerz response
      if (status === "VALID" || status === "VALIDATED") {
        order.paymentStatus = "paid";
        order.paymentId = validationId || tranId;
        order.orderStatus = "processing";
      } else if (status === "FAILED") {
        order.paymentStatus = "failed";
      } else if (status === "CANCELLED") {
        order.paymentStatus = "pending";
      }

      await order.save();

      const redirectUrl =
        status === "VALID" || status === "VALIDATED"
          ? `${origin}/profile?orderId=${order._id}&payment=success`
          : `${origin}/checkout?orderId=${order._id}&payment=${status.toLowerCase()}`;

      return NextResponse.redirect(redirectUrl);
    }

    // Handle payment initiation (JSON POST from client)
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Login required" },
        { status: 401 }
      );
    }

    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "Order ID is required" },
        { status: 400 }
      );
    }

    // ✅ Validate credentials at runtime, not build time
    if (!storeId || !storePass) {
      return NextResponse.json(
        { success: false, message: "SSLCommerz not configured" },
        { status: 500 }
      );
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    if (order.user.toString() !== session.user.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - not your order" },
        { status: 403 }
      );
    }

    if (order.paymentStatus === "paid") {
      return NextResponse.json(
        { success: false, message: "Order already paid" },
        { status: 400 }
      );
    }

    // Initialize SSLCommerz payment
    const sslcz = new SslCommerzPayment(storeId, storePass, isLive);

    const paymentResult = await sslcz.init({
      total_amount: order.totalAmount,
      currency: "BDT",
      tran_id: order._id.toString(),
      success_url: `${origin}/api/checkout`,
      fail_url: `${origin}/api/checkout`,
      cancel_url: `${origin}/api/checkout`,
      cus_name: order.shippingAddress.fullName,
      cus_email: session.user.email || "customer@myshop.com",
      cus_phone: order.shippingAddress.phone,
      cus_add1: order.shippingAddress.address,
      cus_city: order.shippingAddress.city,
      cus_country: "Bangladesh",
      cus_postcode: "1000",
      cus_state: order.shippingAddress.city,
      shipping_method: "Courier",
      num_of_item: order.items.length,
      product_name: order.items
        .map((i) => i.name)
        .join(", ")
        .slice(0, 100),
      product_category: "Ecommerce",
      product_profile: "general",
    });

    if (!paymentResult || !paymentResult.GatewayPageURL) {
      return NextResponse.json(
        { success: false, message: "Failed to initiate payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { redirectUrl: paymentResult.GatewayPageURL },
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}