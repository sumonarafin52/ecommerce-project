// app/api/checkout/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Discount from "@/models/Discount";
import { adjustStock } from "@/lib/productStock";
import { notifyBackInStock } from "@/lib/inventoryEvents";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { SslCommerzPayment, getSslcommerzCredentials, verifySslcommerzTransaction } from "@/lib/sslcommerz";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";

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

      const postbackLimit = await rateLimit(`checkout-postback:${tranId || getClientIp(request)}`, { max: 15, windowMs: 5 * 60_000 });
      if (!postbackLimit.allowed) {
        return NextResponse.redirect(`${origin}/profile?payment=RATE_LIMITED`);
      }

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
            // needed later to call SSLCommerz's refund API against this
            // specific transaction
            order.bankTranId = verified.bank_tran_id || "";
            order.sslcommerzValId = valId;
            if (order.orderStatus === "pending") {
              order.orderStatus = "processing";
              order.activity.push({
                type: "status_changed",
                message: 'Payment verified — order moved from "pending" to "processing"',
                by: { id: null, name: "System" },
                at: new Date(),
              });
            }
          } else {
            // postback claimed success but server-side verification didn't
            // match — treat as failed rather than trusting the client
            order.paymentStatus = "failed";
            finalStatus = "FAILED";
          }
        } else if (status === "FAILED" || status === "CANCELLED") {
          // This endpoint is public and unauthenticated (it has to be —
          // SSLCommerz calls it server-to-server). Previously this branch
          // took the posted status at face value, so anyone who learned an
          // order id could POST status=FAILED and kill a stranger's pending
          // order. Confirm with SSLCommerz that the transaction really
          // isn't valid before acting on it.
          let genuinelyNotPaid = true;
          if (valId) {
            const verified = await verifySslcommerzTransaction({ valId, storeId, storePass, isLive });
            const reallyValid =
              verified &&
              (verified.status === "VALID" || verified.status === "VALIDATED") &&
              String(verified.tran_id) === String(tranId) &&
              Math.abs(Number(verified.amount) - order.totalAmount) < 1;
            if (reallyValid) {
              // the "failure" postback was bogus — the payment actually went
              // through, so honour the real outcome instead
              order.paymentStatus = "paid";
              order.paymentVerifiedAt = new Date();
              order.bankTranId = verified.bank_tran_id || "";
              order.sslcommerzValId = valId;
              if (order.orderStatus === "pending") order.orderStatus = "processing";
              finalStatus = "VALID";
              genuinelyNotPaid = false;
            }
          }
          if (genuinelyNotPaid) {
            order.paymentStatus = "failed";
          }
        }

        // Release the inventory an unpaid order was holding. Stock is
        // reserved up-front at order creation, so without this a failed or
        // abandoned payment silently consumed that stock forever — items
        // showed as out of stock with no real order behind them. A failed
        // order is never reused for a retry (the draft-reuse query only
        // matches paymentStatus: "pending"), so returning the stock here
        // can't double-count against a later attempt.
        if (order.paymentStatus === "failed" && !order.stockReleased) {
          await adjustStock(order.items, 1);
          if (order.discountCode) {
            await Discount.updateOne({ code: order.discountCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
          }
          order.stockReleased = true;
          // freed-up stock may satisfy customers waiting on these items
          for (const it of order.items) notifyBackInStock(it.product);
          order.activity.push({
            type: "status_changed",
            message: "Payment failed — reserved stock returned to inventory",
            by: { id: null, name: "System" },
            at: new Date(),
          });
        }

        await order.save();

        if (order.paymentStatus === "paid") {
          await notify({
            user: order.user,
            type: "payment",
            title: "Payment received",
            message: `We've received your payment for order #${order.orderNumber}.`,
            link: "/profile",
          });
        } else if (order.paymentStatus === "failed") {
          await notify({
            user: order.user,
            type: "payment",
            title: "Payment failed",
            message: `Your payment for order #${order.orderNumber} didn't go through and the order wasn't placed. You're welcome to try again from your cart.`,
            link: "/cart",
          });
        }
      }
      return NextResponse.redirect(`${origin}/profile?payment=${finalStatus}`);
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const initLimit = await rateLimit(`checkout-init:${session.user.id}`, { max: 10, windowMs: 10 * 60_000 });
    if (!initLimit.allowed) {
      return NextResponse.json({ success: false, message: "Too many payment attempts. Please wait a few minutes and try again." }, { status: 429 });
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
    // Its inventory has already been handed back (a previous attempt
    // failed), so this order no longer holds the stock it was created
    // against — paying for it now could oversell. Make them start again.
    if (order.stockReleased) {
      return NextResponse.json(
        { success: false, message: "This order expired after a failed payment. Please place it again from your cart." },
        { status: 409 }
      );
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

    // SSLCommerz returns no GatewayPageURL when init fails (wrong store
    // credentials, sandbox keys used against live, amount rejected...).
    // This used to return success:true with url:undefined, which surfaced
    // to the customer as a blank generic error and gave the admin nothing
    // to diagnose. Log the real reason and report an honest failure.
    if (!result?.GatewayPageURL) {
      const reason = result?.failedreason || result?.errorReason || "SSLCommerz did not return a payment URL";
      console.error("[checkout:init] SSLCommerz init failed:", reason, { orderId: order._id.toString(), isLive });
      return NextResponse.json(
        { success: false, message: `Couldn't start the payment: ${reason}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: { url: result.GatewayPageURL } });
  } catch (error) {
    console.error("[checkout]", error);
    return NextResponse.json({ success: false, message: "Couldn't start the payment. Please try again." }, { status: 500 });
  }
}