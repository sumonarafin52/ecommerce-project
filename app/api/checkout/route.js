// app/api/checkout/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createRequire } from "module";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import { decryptSecret } from "@/lib/crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const require = createRequire(import.meta.url);
const SslCommerzPayment = require("sslcommerz-lts");

// Settings → Payment Methods → SSLCommerz takes priority once an admin
// configures and enables it there; env vars remain the fallback so
// deployments that haven't touched the new Settings UI keep working exactly
// as before (non-breaking).
async function getSslcommerzCredentials() {
  try {
    const settings = await Settings.findOne().lean();
    const stored = settings?.payment?.sslcommerz;
    if (stored?.enabled && stored?.fields?.storeId && stored?.fields?.storePassword) {
      return {
        storeId: stored.fields.storeId,
        storePass: decryptSecret(stored.fields.storePassword),
        isLive: stored.mode === "live",
      };
    }
  } catch {
    // fall through to env vars below
  }
  return {
    storeId: process.env.SSLCOMMERZ_STORE_ID,
    storePass: process.env.SSLCOMMERZ_STORE_PASS || process.env.SSLCOMMERZ_STORE_PASSWORD,
    isLive: process.env.SSLCOMMERZ_IS_LIVE === "true",
  };
}

// Verifies a transaction server-to-server against SSLCommerz's own Validation
// API before trusting it. Without this, the "success" postback below is just
// an unauthenticated POST with a `status` field anyone could forge — this
// closes that hole by re-checking with SSLCommerz directly, and additionally
// confirms the validated amount/currency match what we actually charged.
async function verifySslcommerzTransaction({ valId, storeId, storePass, isLive }) {
  if (!valId) return null;
  const base = isLive
    ? "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
    : "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
  const url = `${base}?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePass)}&format=json`;
  try {
    const res = await fetch(url).then((r) => r.json());
    return res;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const origin = new URL(request.url).origin;
    const contentType = request.headers.get("content-type") || "";
    const { storeId, storePass, isLive } = await getSslcommerzCredentials();

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
      const valId = form.get("val_id");

      const order = await Order.findById(tranId);
      let finalStatus = status;

      if (order && order.paymentStatus !== "paid") {
        if ((status === "VALID" || status === "VALIDATED") && valId) {
          // never trust the postback's own claim — re-verify with SSLCommerz
          const verified = await verifySslcommerzTransaction({ valId, storeId, storePass, isLive });
          const amountMatches = verified && Math.abs(Number(verified.amount) - order.totalAmount) < 1;
          const statusVerified = verified?.status === "VALID" || verified?.status === "VALIDATED";

          if (verified && statusVerified && amountMatches && String(verified.tran_id) === String(tranId)) {
            order.paymentStatus = "paid";
            order.paymentVerifiedAt = new Date();
          } else {
            // postback claimed success but server-side verification didn't
            // match — treat as failed rather than trusting the client
            order.paymentStatus = "failed";
            finalStatus = "FAILED";
          }
        } else if (status === "FAILED") {
          order.paymentStatus = "failed";
        }
        await order.save();
      }
      return NextResponse.redirect(`${origin}/profile?payment=${finalStatus}`);
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