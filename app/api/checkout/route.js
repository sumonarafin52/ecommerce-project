// app/api/checkout/route.js
import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Discount from "@/models/Discount";
import { adjustStock } from "@/lib/productStock";
import { STOCK_REASONS } from "@/models/StockMovement";
import { notifyBackInStock } from "@/lib/inventoryEvents";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Settings from "@/models/Settings";
import { getPaymentAdapter, getProviderCredentials } from "@/lib/payments";
import { claimPaymentEvent, recordEventOutcome, amountsMatch } from "@/lib/payments/adapter";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { createGrantsForOrder } from "@/lib/digitalDelivery";
import { notify } from "@/lib/notify";

// Compares two tokens without leaking their contents through timing. Same
// helper the order and download routes use for guest access.
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Which payment provider a request concerns, taken from ?provider=.
 *
 * Read from the URL rather than the body because the same answer is needed
 * for a form-encoded gateway callback, a JSON initiate call and a plain GET
 * redirect — and because the body can only be read once.
 *
 * Anything unrecognised falls back to SSLCommerz, which is what every
 * callback URL registered before this existed looks like.
 */
function resolveProvider(request) {
  const asked = new URL(request.url).searchParams.get("provider") || "";
  return getPaymentAdapter(asked) ? asked : "sslcommerz";
}

export async function POST(request) {
  try {
    await connectDB();
    const origin = new URL(request.url).origin;
    const contentType = request.headers.get("content-type") || "";

    // Which provider this request belongs to.
    //
    // SSLCommerz was hard-coded here, despite the comment, so a second
    // provider's callback would have been verified against the wrong
    // gateway. It now comes from the request: the callback URL the store
    // registers with each provider carries ?provider=, and an initiate call
    // names the method the customer chose. SSLCommerz stays the default so
    // the callback URLs already registered with them keep working
    // unchanged.
    const providerId = resolveProvider(request);
    const adapter = getPaymentAdapter(providerId);
    const credentials = await getProviderCredentials(providerId);

    if (!adapter || !adapter.isConfigured(credentials)) {
      return NextResponse.json(
        { success: false, message: "Online payment isn't configured for this store." },
        { status: 500 }
      );
    }

    // ---- gateway callback (success / fail / cancel / IPN) ----------------
    //
    // This endpoint is public — it has to be, since the gateway calls it
    // server-to-server. Three things therefore guard it:
    //   1. rate limiting, so it can't be hammered;
    //   2. an idempotency claim, so a retried or replayed delivery is a
    //      no-op rather than a second state change;
    //   3. verification against the provider, so the callback's own claim
    //      about whether money moved is never taken at face value.
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      return NextResponse.redirect(
        await settleCallback({ request, fields: form, adapter, credentials, providerId, origin })
      );
    }

    // ---- start a payment -------------------------------------------------
    const session = await getServerSession(authOptions);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    // A guest has no account, so they prove ownership of their order with
    // the access token issued when it was placed — the same mechanism the
    // order page and the downloads use.
    const guestToken = typeof body.guestToken === "string" ? body.guestToken : "";

    if (!session?.user && !guestToken) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(orderId)) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const initLimit = await rateLimit(`checkout-init:${session?.user?.id || `guest:${getClientIp(request)}`}`, {
      max: 10,
      windowMs: 10 * 60_000,
    });
    if (!initLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many payment attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const order = await Order.findById(orderId).select("+guestAccessToken");
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // Guest checkout made `user` optional, so this can't dereference it
    // blindly. Before this, a guest placing an online-payment order was
    // told "Login required" and could never pay for the order they'd just
    // created — while its stock stayed reserved.
    const isOwner = !!session?.user && !!order.user && order.user.toString() === session.user.id;
    const isGuestHolder =
      !!guestToken && !!order.guestAccessToken && timingSafeEqualStr(guestToken, order.guestAccessToken);
    if (!isOwner && !isGuestHolder) {
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

    // The store's currency lives with the invoice configuration — the same
    // value the invoice and the storefront format prices with.
    const storeSettings = await Settings.findOne().select("billing").lean();
    const result = await adapter.initiate({
      order,
      credentials,
      origin,
      customer: {
        name: order.shippingAddress?.fullName,
        // guests identify by the email on the order rather than a session
        email: session?.user?.email || order.guestEmail || "",
      },
      currency: storeSettings?.billing?.invoice?.currency || "BDT",
    });

    // SSLCommerz returns no GatewayPageURL when init fails (wrong store
    // credentials, sandbox keys used against live, amount rejected...).
    // This used to return success:true with url:undefined, which surfaced
    // to the customer as a blank generic error and gave the admin nothing
    // to diagnose. Log the real reason and report an honest failure.
    if (!result?.ok || !result.redirectUrl) {
      console.error("[checkout:init] payment initiation failed:", result?.error, {
        provider: providerId,
        orderId: order._id.toString(),
        isLive: !!credentials.isLive,
      });
      return NextResponse.json(
        { success: false, message: `Couldn't start the payment: ${result?.error || "the gateway didn't respond"}` },
        { status: 502 }
      );
    }

    // Recorded before the customer leaves, because this is how the
    // redirect coming back is matched to an order: the id lives here, not
    // in a URL the customer could edit.
    if (result.providerRef) {
      order.paymentProviderRef = String(result.providerRef);
      order.paymentMethod = providerId;
      await order.save();
    }

    return NextResponse.json({ success: true, data: { url: result.redirectUrl } });
  } catch (error) {
    console.error("[checkout]", error);
    return NextResponse.json({ success: false, message: "Couldn't start the payment. Please try again." }, { status: 500 });
  }
}

/**
 * Everything that happens when a gateway tells the store a payment
 * finished: claim the event, ask the provider what really happened, move
 * the order, release stock if it failed, tell the customer.
 *
 * Extracted so that there is exactly ONE implementation of this path. It
 * used to live inside the form-POST branch, which was fine while
 * SSLCommerz was the only provider — bKash redirects the customer back
 * with a GET, and a second copy of this logic is the last thing a
 * money-critical path needs.
 *
 * Returns the URL the customer should land on.
 */
/**
 * The customer coming back from a hosted payment page.
 *
 * SSLCommerz posts its result server-to-server; bKash sends the shopper's
 * own browser back here with the payment id in the query string. Both end
 * up in the same settle path — the GET carries no authority of its own,
 * and the payment is confirmed by asking the provider.
 */
export async function GET(request) {
  try {
    await connectDB();
    const url = new URL(request.url);
    const origin = url.origin;

    const providerId = resolveProvider(request);
    const adapter = getPaymentAdapter(providerId);
    const credentials = await getProviderCredentials(providerId);

    if (!adapter || !adapter.isConfigured(credentials)) {
      return NextResponse.redirect(`${origin}/`);
    }

    // Nothing to settle — somebody opened the URL directly, or followed a
    // stale link. What makes a request a callback is something to identify
    // the payment by, and only the adapter knows what that looks like for
    // its own gateway. Listing the parameter names here instead would put
    // each provider's vocabulary back in the shared route.
    const probe = adapter.parseCallback(url.searchParams);
    if (!probe?.verificationToken && !probe?.orderId) {
      return NextResponse.redirect(`${origin}/`);
    }

    return NextResponse.redirect(
      await settleCallback({ request, fields: url.searchParams, adapter, credentials, providerId, origin })
    );
  } catch (error) {
    console.error("[checkout:return]", error);
    return NextResponse.redirect(`${new URL(request.url).origin}/profile?payment=FAILED`);
  }
}

async function settleCallback({ request, fields, adapter, credentials, providerId, origin }) {

    // The caller has already read the body (a form POST) or the query
    // string (a GET redirect) and passes the fields in — reading the body
    // twice throws.
    const parsed = adapter.parseCallback(fields);

    const postbackLimit = await rateLimit(
      `checkout-postback:${parsed.orderId || getClientIp(request)}`,
      { max: 15, windowMs: 5 * 60_000 }
    );
    if (!postbackLimit.allowed) {
      return `${origin}/profile?payment=RATE_LIMITED`;
    }

    // Cheap forgery filter where the provider signs its callback. A
    // callback with no signature isn't rejected — verification below is
    // the real authority — but one that carries a bad signature is.
    if (typeof adapter.checkSignature === "function") {
      const sig = adapter.checkSignature(fields, credentials.storePassword);
      if (sig.checked && !sig.valid) {
        console.error("[checkout:callback] signature check failed", { orderId: parsed.orderId });
        return `${origin}/profile?payment=FAILED`;
      }
    }

    // Two ways to find the order, and neither trusts the customer's
    // browser. SSLCommerz posts the order id back server-to-server. bKash
    // redirects the shopper's own browser here, so the order is found by
    // the payment id the store recorded when it created the payment —
    // something the customer never had a chance to change.
    let order = null;
    if (parsed.orderId && /^[0-9a-fA-F]{24}$/.test(parsed.orderId)) {
      order = await Order.findById(parsed.orderId).select("+guestAccessToken");
    } else if (parsed.verificationToken) {
      order = await Order.findOne({ paymentProviderRef: String(parsed.verificationToken) }).select("+guestAccessToken");
    }

    let finalStatus = parsed.rawStatus;

    // Claim this event. A false means another delivery of the same event
    // already did the work — the customer still gets sent to the right
    // page below, but nothing is changed a second time.
    const isNewEvent = await claimPaymentEvent({
      provider: providerId,
      eventId: parsed.eventId,
      order: order?._id || null,
      status: parsed.rawStatus,
      note: "gateway callback",
    });

    if (isNewEvent && order && order.paymentStatus !== "paid") {
      const result = await adapter.verify({
        verificationToken: parsed.verificationToken,
        orderId: String(order._id),
        credentials,
        expectedAmount: order.totalAmount,
      });

      const amountOk = amountsMatch(result.amount, order.totalAmount);
      const reallyPaid = result.ok && result.paid && amountOk;

      if (reallyPaid) {
        order.paymentStatus = "paid";
        order.paymentVerifiedAt = new Date();
        // needed later to call the gateway's refund API against this
        // specific transaction
        order.bankTranId = result.transactionId || "";
        order.paymentProviderRef = result.providerRef || parsed.verificationToken || order.paymentProviderRef || "";
        // Kept for SSLCommerz only — it is their field name and their
        // refund API needs it. A bKash payment id lives in
        // paymentProviderRef above.
        if (providerId === "sslcommerz") order.sslcommerzValId = parsed.verificationToken || "";
        finalStatus = "VALID";
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
        // Covers both a genuine failure and a callback that CLAIMED
        // success but didn't survive verification — including the case
        // where someone posts a status of their choosing to this public
        // endpoint, and the case where the amount paid doesn't match the
        // order.
        order.paymentStatus = "failed";
        finalStatus = parsed.rawStatus === "CANCELLED" ? "CANCELLED" : "FAILED";
        if (result.ok && !amountOk && result.paid) {
          console.error("[checkout:callback] amount mismatch", {
            orderId: String(order._id),
            paid: result.amount,
            expected: order.totalAmount,
          });
        }
      }

      // Release the inventory an unpaid order was holding. Stock is
      // reserved up-front at order creation, so without this a failed or
      // abandoned payment silently consumed that stock forever.
      if (order.paymentStatus === "failed" && !order.stockReleased) {
        await adjustStock(order.items, 1, null, {
          reason: STOCK_REASONS.PAYMENT_FAILED,
          order: order._id,
        });
        if (order.discountCode) {
          await Discount.updateOne({ code: order.discountCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
        }
        order.stockReleased = true;
        for (const it of order.items) notifyBackInStock(it.product);
        order.activity.push({
          type: "status_changed",
          message: "Payment failed — reserved stock returned to inventory",
          by: { id: null, name: "System" },
          at: new Date(),
        });
      }

      await order.save();
      await recordEventOutcome({
        provider: providerId,
        eventId: parsed.eventId,
        outcome: order.paymentStatus,
      });

      if (order.paymentStatus === "paid") {
        // Digital goods deliver on payment, not on shipment. Idempotent
        // in its own right, and now additionally protected by the event
        // claim above.
        await createGrantsForOrder(order);

        await notify({
          user: order.user,
          guestEmail: order.guestEmail,
          phone: order.shippingAddress?.phone,
          type: "payment",
          title: "Payment received",
          message: `We've received your payment for order #${order.orderNumber}.`,
          link: "/profile",
        });
      } else if (order.paymentStatus === "failed") {
        await notify({
          user: order.user,
          guestEmail: order.guestEmail,
          phone: order.shippingAddress?.phone,
          type: "payment",
          title: "Payment failed",
          message: `Your payment for order #${order.orderNumber} didn't go through and the order wasn't placed. You're welcome to try again from your cart.`,
          link: "/cart",
        });
      }
    } else if (order?.paymentStatus === "paid") {
      // A repeat delivery for an order that's already paid: send the
      // customer to their confirmation rather than telling them it failed.
      finalStatus = "VALID";
    }

    // A confirmed payment lands on the order's confirmation page; anything
    // else goes back to the account page, which explains what happened.
    if (order && order.paymentStatus === "paid") {
      // a guest has no session, so carry their access token back with them
      const guestParam = order.guestAccessToken ? `&t=${order.guestAccessToken}` : "";
      return `${origin}/order-confirmation/${order._id}?payment=VALID${guestParam}`;
    }
    // A callback that matches no order must never report success. This
    // endpoint is public, so anyone can invent a payment id and a
    // status=success — and reporting VALID told them "Payment successful"
    // and emptied their basket for a payment that touched nothing.
    if (!order) {
      return `${origin}/profile?payment=NO_ORDER`;
    }
    return `${origin}/profile?payment=${finalStatus || "FAILED"}`;
  
}
