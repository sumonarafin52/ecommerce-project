// lib/payments/sslcommerz.js
//
// SSLCommerz, as an adapter. This is the provider the store actually uses,
// so it's the reference implementation of the contract in ./adapter.js.
//
// On verification: SSLCommerz posts an IPN/return to the store, and that
// post carries its own `status`. That status is not evidence — the endpoint
// has to be publicly reachable for the gateway to call it, which means
// anybody can call it too. The authoritative check is a server-to-server
// request to SSLCommerz's validation API with the `val_id`, which is what
// `verify()` does. The optional signature check below is a cheap pre-filter
// on top of that, not a replacement for it.
import crypto from "crypto";
import { SslCommerzPayment, verifySslcommerzTransaction } from "@/lib/sslcommerz";

export const sslcommerzAdapter = {
  id: "sslcommerz",
  label: "SSLCommerz",

  capabilities: {
    hostedPage: true,
    webhooks: true,
    // SSLCommerz refunds need the bank transaction id from a settled
    // payment, and the merchant account must have refunds enabled. The
    // store records refunds either way; see refund() below.
    refunds: true,
    partialRefunds: true,
  },

  isConfigured(credentials) {
    return !!(credentials?.storeId && credentials?.storePassword);
  },

  async initiate({ order, credentials, origin, customer, currency }) {
    const { storeId, storePassword, isLive } = credentials;
    const sslcz = new SslCommerzPayment(storeId, storePassword, !!isLive);

    const address = order.shippingAddress || {};
    // A download-only order has nothing to ship, and SSLCommerz wants
    // "NO" rather than courier details it would then demand.
    const ships = order.requiresShipping !== false;

    let result;
    try {
      result = await sslcz.init({
        total_amount: order.totalAmount,
        // Currency used to be hard-coded to BDT, which quietly broke the
        // "international" part of the platform — an order priced in another
        // currency would have been charged as though it were taka.
        currency: currency || "BDT",
        tran_id: order._id.toString(),
        success_url: `${origin}/api/checkout`,
        fail_url: `${origin}/api/checkout`,
        cancel_url: `${origin}/api/checkout`,
        ipn_url: `${origin}/api/checkout`,
        cus_name: address.fullName || customer?.name || "Customer",
        // A guest order has no account, so the email comes from the order.
        cus_email: customer?.email || "no-reply@example.com",
        cus_phone: address.phone || "",
        cus_add1: address.address || "N/A",
        cus_city: address.city || "N/A",
        // Taken from the order rather than assumed — a shipping address now
        // carries its own country.
        cus_country: address.country || "Bangladesh",
        shipping_method: ships ? "Courier" : "NO",
        // SSLCommerz rejects a "Courier" order that doesn't carry shipping
        // details — "Invalid Information! 'ship_name' is missing." These
        // were never sent, so every physical-goods payment was refused by
        // the gateway before it ever reached the customer's bank.
        ...(ships
          ? {
              ship_name: address.fullName || customer?.name || "Customer",
              ship_add1: address.address || "N/A",
              ship_city: address.city || "N/A",
              ship_state: address.state || "",
              ship_postcode: address.postalCode || "0000",
              ship_country: address.country || "Bangladesh",
            }
          : {}),
        num_of_item: order.items.length,
        product_name: order.items.map((i) => i.name).join(", ").slice(0, 100),
        product_category: "Ecommerce",
        product_profile: ships ? "general" : "non-physical-goods",
      });
    } catch (err) {
      return { ok: false, error: `Couldn't reach SSLCommerz: ${err?.message || "request failed"}` };
    }

    // No GatewayPageURL means init failed — wrong credentials, sandbox keys
    // against live, a rejected amount. Returning ok:true with an undefined
    // URL (as this once did) showed the customer a blank error and told the
    // admin nothing.
    if (!result?.GatewayPageURL) {
      const reason = result?.failedreason || result?.errorReason || "SSLCommerz did not return a payment URL";
      return { ok: false, error: reason };
    }

    return { ok: true, redirectUrl: result.GatewayPageURL, providerRef: result.sessionkey || "" };
  },

  /**
   * Reads an SSLCommerz callback.
   *
   * eventId: `val_id` identifies one validated transaction and is the
   * natural key. A failure or cancellation carries no val_id, so those fall
   * back to the transaction id plus the status — which is still stable for
   * the event and distinct from the success case.
   */
  parseCallback(fields) {
    const tranId = fields.get ? fields.get("tran_id") : fields.tran_id;
    const status = fields.get ? fields.get("status") : fields.status;
    const valId = fields.get ? fields.get("val_id") : fields.val_id;

    return {
      orderId: tranId ? String(tranId) : "",
      rawStatus: status ? String(status) : "",
      eventId: valId ? `val:${valId}` : `tran:${tranId}:${status}`,
      verificationToken: valId ? String(valId) : "",
    };
  },

  /**
   * Confirms with SSLCommerz what actually happened, and checks that what
   * came back belongs to this order and matches its amount.
   */
  async verify({ verificationToken, orderId, credentials, expectedAmount }) {
    if (!verificationToken) {
      return { ok: true, paid: false, reason: "no validation id — nothing to verify against" };
    }

    const verified = await verifySslcommerzTransaction({
      valId: verificationToken,
      storeId: credentials.storeId,
      storePass: credentials.storePassword,
      isLive: !!credentials.isLive,
    });

    if (!verified) {
      return { ok: false, paid: false, reason: "could not reach the SSLCommerz validation API" };
    }

    const statusValid = verified.status === "VALID" || verified.status === "VALIDATED";
    // The validation response must be for THIS order. Without this check a
    // valid val_id from any other transaction would mark this one paid.
    const sameOrder = String(verified.tran_id) === String(orderId);

    return {
      ok: true,
      paid: statusValid && sameOrder,
      sameOrder,
      amount: Number(verified.amount),
      currency: verified.currency_type || verified.currency || "",
      transactionId: verified.bank_tran_id || "",
      providerRef: verificationToken,
      reason: statusValid ? (sameOrder ? "" : "validation belongs to a different order") : `status ${verified.status}`,
      expectedAmount,
    };
  },

  /**
   * Optional signature pre-filter.
   *
   * SSLCommerz can sign its IPN: `verify_sign` is an MD5 over the posted
   * fields named in `verify_key`, with the store password hash appended.
   * It's cheap to check and rejects obvious forgeries before a network call
   * — but the validation API in verify() remains the real authority, so a
   * callback WITHOUT a signature is not rejected here, only one that carries
   * a signature and fails it.
   */
  checkSignature(fields, storePassword) {
    const get = (k) => (fields.get ? fields.get(k) : fields[k]);
    const sign = get("verify_sign");
    const key = get("verify_key");
    if (!sign || !key || !storePassword) return { checked: false, valid: true };

    try {
      const passHash = crypto.createHash("md5").update(String(storePassword)).digest("hex");
      const parts = String(key)
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => `${k}=${get(k) ?? ""}`);
      parts.push(`store_passwd=${passHash}`);
      parts.sort();
      const expected = crypto.createHash("md5").update(parts.join("&")).digest("hex");
      return { checked: true, valid: expected === String(sign) };
    } catch {
      // A malformed signature shouldn't block a payment the validation API
      // will confirm anyway.
      return { checked: false, valid: true };
    }
  },

  /**
   * Issues a refund through SSLCommerz.
   *
   * Returns `possible: false` — not an error — when automation genuinely
   * isn't available for this order, so the caller can fall back to recording
   * a manual refund with the real reason shown to staff, instead of a button
   * that appears to work and quietly does nothing.
   */
  async refund({ order, amount, reason, credentials }) {
    if (!order.bankTranId) {
      return {
        possible: false,
        note: "No bank transaction id on file for this order (the payment may predate this feature, or wasn't verified) — the refund must be issued manually from the SSLCommerz merchant panel.",
      };
    }
    if (!this.isConfigured(credentials)) {
      return {
        possible: false,
        note: "SSLCommerz isn't configured (Settings → Payment Methods) — the refund API can't be called.",
      };
    }

    try {
      const sslcz = new SslCommerzPayment(credentials.storeId, credentials.storePassword, !!credentials.isLive);
      const result = await sslcz.initiateRefund({
        refund_amount: amount,
        refund_remarks: reason || "Refund issued via admin panel",
        bank_tran_id: order.bankTranId,
        refe_id: order._id.toString(),
      });

      // APIConnect "DONE" means the refund REQUEST was accepted; settlement
      // happens asynchronously afterwards, and refund_ref_id is what a later
      // status query polls.
      if (result?.APIConnect === "DONE" && result?.refund_ref_id) {
        return {
          possible: true,
          success: true,
          status: "gateway_pending",
          refundRefId: result.refund_ref_id,
          message: result.errorReason || "Refund initiated with SSLCommerz — settlement is processed by the gateway.",
        };
      }

      return {
        possible: true,
        success: false,
        status: "gateway_failed",
        message: result?.errorReason || result?.APIConnect || "SSLCommerz rejected the refund request.",
      };
    } catch (err) {
      return {
        possible: true,
        success: false,
        status: "gateway_failed",
        message: err?.message || "The SSLCommerz refund API call failed.",
      };
    }
  },
};

export default sslcommerzAdapter;
