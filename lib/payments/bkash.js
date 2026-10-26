// lib/payments/bkash.js
//
// bKash, as an adapter — their "tokenized checkout" (PGW) API.
//
// Until now bKash was configurable in Settings but deliberately hidden at
// checkout, because storing credentials is not an integration and offering
// a payment method that cannot take money is worse than not offering it.
// This is the implementation that makes it real.
//
// The flow, which is why the code has the shape it does:
//
//   1. grant a token          credentials -> id_token (about an hour)
//   2. create a payment       amount + callback URL -> paymentID + bkashURL
//   3. send the customer to bkashURL, where they authorise it
//   4. bKash redirects back   ?paymentID=...&status=success|failure|cancel
//   5. EXECUTE the payment    this is the step that actually takes the money
//   6. if execute is lost     query the payment's status instead
//
// Step 5 is the part that catches people out: until execute succeeds, no
// money has moved, no matter what the redirect says. And execute can only
// be called once — if the response is lost in transit (a dropped
// connection, a timeout, a customer closing the tab) calling it again
// returns an error rather than the result. So a failed execute always falls
// through to a status query before this adapter will call a payment failed.
// Treating a lost response as a failure would reject payments the customer
// has genuinely made.
//
// Nothing here ever trusts the redirect's own `status`, and nothing logs a
// credential.
const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout";
const LIVE_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";

/** bKash's own success code. Everything else is an error with a message. */
const OK = "0000";

/**
 * Which bKash to talk to.
 *
 * BKASH_API_BASE redirects the SANDBOX only — for testing the round trip
 * against a local stub, or against a different sandbox host if bKash gives
 * you one. Live mode ignores it completely and always uses bKash's own
 * host, so a stray environment variable can never send real payments
 * somewhere else.
 */
const baseUrl = (isLive) => {
  if (isLive) return LIVE_BASE;
  const override = (process.env.BKASH_API_BASE || "").trim().replace(/\/$/, "");
  return override || SANDBOX_BASE;
};

// Tokens last about an hour, and a grant call counts against rate limits,
// so one is kept per credential set until shortly before it expires. Keyed
// on the app key and mode, never on the secret.
const tokenCache = new Map();

/** Exposed for tests and for a credentials change in Settings. */
export function clearTokenCache() {
  tokenCache.clear();
}

const cacheKey = (credentials) => `${credentials.appKey}:${credentials.isLive ? "live" : "sandbox"}`;

async function postJson(url, { body, headers = {}, timeoutMs = 20_000 }) {
  // A payment gateway that stops answering must not hold a checkout request
  // open indefinitely — the customer is watching a spinner.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // bKash answers with HTML when something upstream is wrong; the body
      // is not echoed anywhere a customer could see it.
      return { ok: false, status: res.status, error: "unreadable response from bKash" };
    }
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === "AbortError" ? "bKash did not respond in time" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A usable id_token, from the cache when one is still good.
 *
 * Returns { ok, token, error }. The error is a short phrase safe to log —
 * bKash's own message, which never contains the credentials.
 */
export async function grantToken(credentials, { now = Date.now() } = {}) {
  const key = cacheKey(credentials);
  const cached = tokenCache.get(key);
  // A minute of margin, so a token cannot expire between the check and the
  // call that uses it.
  if (cached && cached.expiresAt - 60_000 > now) return { ok: true, token: cached.token };

  const res = await postJson(`${baseUrl(credentials.isLive)}/token/grant`, {
    headers: { username: credentials.username, password: credentials.password },
    body: { app_key: credentials.appKey, app_secret: credentials.appSecret },
  });

  const token = res.json?.id_token;
  if (!res.ok || !token) {
    return { ok: false, error: res.json?.statusMessage || res.error || "could not get a bKash token" };
  }

  // expires_in is in seconds and is usually 3600.
  const ttl = Number(res.json.expires_in) > 0 ? Number(res.json.expires_in) * 1000 : 3600_000;
  tokenCache.set(key, { token, expiresAt: now + ttl });

  return { ok: true, token };
}

/** The two headers every call after the grant needs. */
const authHeaders = (token, credentials) => ({ Authorization: token, "X-APP-Key": credentials.appKey });

export const bkashAdapter = {
  id: "bkash",
  label: "bKash",

  capabilities: {
    hostedPage: true,
    // bKash redirects the customer back to the store; there is no separate
    // server-to-server webhook in tokenized checkout, which is exactly why
    // verify() does its own server-side execute/query rather than relying
    // on what comes back in the URL.
    webhooks: false,
    refunds: true,
    partialRefunds: true,
  },

  isConfigured(credentials) {
    return !!(credentials?.appKey && credentials?.appSecret && credentials?.username && credentials?.password);
  },

  /**
   * Creates the payment and returns where to send the customer.
   *
   * The order id travels as the merchant invoice number and in the callback
   * URL, so the callback can be tied back to an order without trusting
   * anything the customer's browser carries.
   */
  async initiate({ order, credentials, origin, currency }) {
    // bKash is a taka wallet. Taking an order priced in another currency
    // and sending the number to bKash would charge a different amount than
    // the customer agreed to.
    const cur = (currency || "BDT").toUpperCase();
    if (cur !== "BDT") {
      return { ok: false, error: "bKash can only take payments in BDT." };
    }

    const token = await grantToken(credentials);
    if (!token.ok) return { ok: false, error: token.error };

    const orderId = String(order._id);
    const res = await postJson(`${baseUrl(credentials.isLive)}/create`, {
      headers: authHeaders(token.token, credentials),
      body: {
        mode: "0011", // checkout (customer authorises in bKash's own page)
        payerReference: order.shippingAddress?.phone || orderId,
        callbackURL: `${origin}/api/checkout?provider=bkash`,
        amount: Number(order.totalAmount).toFixed(2),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: order.orderNumber || orderId,
      },
    });

    const data = res.json || {};
    if (!res.ok || data.statusCode !== OK || !data.bkashURL || !data.paymentID) {
      return { ok: false, error: data.statusMessage || res.error || "bKash would not start this payment" };
    }

    return { ok: true, redirectUrl: data.bkashURL, providerRef: data.paymentID };
  },

  /**
   * Reads bKash's redirect.
   *
   * It arrives as query parameters on a GET, carrying a paymentID and a
   * status. The status is a hint for the customer-facing message only —
   * verify() decides whether money moved.
   */
  parseCallback(fields) {
    const get = (k) => (fields?.get ? fields.get(k) : fields?.[k]);
    const paymentId = get("paymentID") || "";
    const status = String(get("status") || "").toLowerCase();

    return {
      // Deliberately empty. The redirect lands in the customer's own
      // browser, so anything in the URL is theirs to edit — putting the
      // order id there would invite pointing a successful payment at a
      // different order. The settle path finds the order by the payment id
      // the store recorded when it created the payment instead.
      orderId: "",
      rawStatus: status === "success" ? "VALID" : status === "cancel" ? "CANCELLED" : "FAILED",
      // Stable per payment, so a repeated redirect is recognised as the
      // same event and does nothing twice.
      eventId: paymentId ? `bkash:${paymentId}` : `bkash:none:${Date.now()}`,
      verificationToken: String(paymentId),
    };
  },

  /**
   * Asks bKash what really happened, and checks it belongs to this order.
   *
   * Execute first, because that is the call that takes the money. If it
   * fails for any reason — including a response lost on the way back — the
   * payment's status is queried before deciding, since the money may well
   * have moved.
   */
  async verify({ verificationToken, credentials, expectedAmount }) {
    if (!verificationToken) {
      return { ok: true, paid: false, reason: "no bKash payment id — nothing to verify against" };
    }

    const token = await grantToken(credentials);
    if (!token.ok) return { ok: false, paid: false, reason: token.error };

    const headers = authHeaders(token.token, credentials);
    const url = baseUrl(credentials.isLive);

    let data = null;

    const execute = await postJson(`${url}/execute`, { headers, body: { paymentID: verificationToken } });
    if (execute.json?.statusCode === OK) {
      data = execute.json;
    } else {
      // Not a failure yet. An already-executed payment, a timeout, or a
      // customer who closed the tab mid-redirect all land here, and in
      // every one of those cases the money may already be taken.
      const query = await postJson(`${url}/payment/status`, { headers, body: { paymentID: verificationToken } });
      if (query.json?.statusCode === OK) data = query.json;
      else {
        return {
          ok: false,
          paid: false,
          reason: query.json?.statusMessage || execute.json?.statusMessage || execute.error || "bKash did not confirm this payment",
        };
      }
    }

    const completed = String(data.transactionStatus || "").toLowerCase() === "completed";
    const amount = Number(data.amount);

    return {
      ok: true,
      paid: completed,
      amount: Number.isFinite(amount) ? amount : 0,
      currency: data.currency || "BDT",
      transactionId: data.trxID || "",
      providerRef: data.paymentID || verificationToken,
      reason: completed ? "" : data.transactionStatus || "not completed",
    };
  },

  /**
   * Refunds against the original transaction.
   *
   * bKash needs the trxID from the settled payment, which the order carries
   * as `bankTranId` once verify() recorded it. Without one there is nothing
   * to refund against, and saying so is more use than a silent failure.
   */
  async refund({ order, amount, credentials }) {
    const trxId = order?.bankTranId;
    const paymentId = order?.paymentProviderRef;
    if (!trxId || !paymentId) {
      return { ok: false, error: "This order has no bKash transaction to refund against." };
    }

    const token = await grantToken(credentials);
    if (!token.ok) return { ok: false, error: token.error };

    const res = await postJson(`${baseUrl(credentials.isLive)}/payment/refund`, {
      headers: authHeaders(token.token, credentials),
      body: {
        paymentID: paymentId,
        trxID: trxId,
        amount: Number(amount).toFixed(2),
        sku: order.orderNumber || String(order._id),
        reason: "Refund issued by the store",
      },
    });

    const data = res.json || {};
    // bKash answers a refund with its own completion status rather than the
    // 0000 code used elsewhere.
    const done = String(data.transactionStatus || "").toLowerCase() === "completed" || data.refundTrxID;
    if (!res.ok || !done) {
      return { ok: false, error: data.statusMessage || res.error || "bKash refused the refund" };
    }

    return { ok: true, refundId: data.refundTrxID || "" };
  },

  /**
   * A real call to bKash with the stored credentials, for the Test
   * connection button in Settings. Granting a token is the smallest request
   * that proves all four values are right, and it moves no money.
   */
  async testConnection(credentials) {
    if (!this.isConfigured(credentials)) {
      return { ok: false, error: "Fill in all four bKash fields first." };
    }
    clearTokenCache(); // test what is stored now, not what was cached earlier
    const token = await grantToken(credentials);
    return token.ok
      ? { ok: true, message: `bKash answered — ${credentials.isLive ? "live" : "sandbox"} credentials are working.` }
      : { ok: false, error: token.error };
  },
};

export default bkashAdapter;
