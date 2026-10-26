// tests/bkash.test.js
//
// The bKash adapter, against a stub that answers the way bKash's tokenized
// checkout API is documented to.
//
// The expensive failures in a payment integration are specific, and each
// one has a test here:
//
//   - believing the redirect's own "status=success" and marking an order
//     paid when no money moved
//   - calling a payment failed because the EXECUTE response was lost,
//     when the customer has in fact paid
//   - accepting an amount different from the order's
//   - granting a fresh token on every call and getting rate limited
//   - leaking a credential into a log or an error shown to a customer
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { bkashAdapter, grantToken, clearTokenCache } = await import("@/lib/payments/bkash");

const CREDENTIALS = {
  appKey: "app-key-1",
  appSecret: "app-secret-1",
  username: "merchant",
  password: "merchant-pass",
  isLive: false,
};

const order = (over = {}) => ({
  _id: "650000000000000000000001",
  orderNumber: "ORD-1",
  totalAmount: 1500,
  shippingAddress: { phone: "01700000000" },
  ...over,
});

// One stub for the whole API. Each test says what the next call answers.
let routes;
const calls = [];

const respond = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  clearTokenCache();
  calls.length = 0;
  routes = {
    "/token/grant": () => respond({ id_token: "tok-1", refresh_token: "ref-1", expires_in: 3600 }),
  };

  vi.stubGlobal("fetch", async (url, init) => {
    const path = String(url).replace(/^.*\/tokenized\/checkout/, "");
    calls.push({ path, headers: init?.headers || {}, body: JSON.parse(init?.body || "{}") });
    const handler = routes[path];
    if (!handler) return respond({ statusCode: "9999", statusMessage: `no stub for ${path}` }, { status: 404 });
    return handler(calls[calls.length - 1]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getting a token", () => {
  it("sends the credentials the way bKash expects them", async () => {
    const res = await grantToken(CREDENTIALS);

    expect(res.ok).toBe(true);
    expect(res.token).toBe("tok-1");
    // username and password go in the headers; the key and secret in the body
    expect(calls[0].headers.username).toBe("merchant");
    expect(calls[0].body).toEqual({ app_key: "app-key-1", app_secret: "app-secret-1" });
  });

  it("reuses a token instead of granting one per call", async () => {
    await grantToken(CREDENTIALS);
    await grantToken(CREDENTIALS);
    await grantToken(CREDENTIALS);

    // bKash rate limits token grants; one per hour is the point of the cache.
    expect(calls.filter((c) => c.path === "/token/grant")).toHaveLength(1);
  });

  it("grants a fresh one once the old one is near expiry", async () => {
    const t0 = 1_000_000;
    await grantToken(CREDENTIALS, { now: t0 });
    // 59 minutes later the hour-long token is inside the safety margin
    await grantToken(CREDENTIALS, { now: t0 + 59.5 * 60_000 });

    expect(calls.filter((c) => c.path === "/token/grant")).toHaveLength(2);
  });

  it("reports bKash's own reason when it refuses", async () => {
    routes["/token/grant"] = () => respond({ statusMessage: "Invalid App Key" }, { status: 401 });

    const res = await grantToken(CREDENTIALS);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Invalid App Key");
    // and nothing secret travels with it
    expect(JSON.stringify(res)).not.toContain("app-secret-1");
    expect(JSON.stringify(res)).not.toContain("merchant-pass");
  });
});

describe("starting a payment", () => {
  it("creates it and returns where to send the customer", async () => {
    routes["/create"] = () => respond({ statusCode: "0000", paymentID: "pay-1", bkashURL: "https://bkash.test/pay-1" });

    const res = await bkashAdapter.initiate({ order: order(), credentials: CREDENTIALS, origin: "https://shop.test" });

    expect(res).toMatchObject({ ok: true, redirectUrl: "https://bkash.test/pay-1", providerRef: "pay-1" });

    const create = calls.find((c) => c.path === "/create");
    expect(create.body.amount).toBe("1500.00");
    expect(create.body.currency).toBe("BDT");
    // the callback has to name the provider, or the return trip would be
    // verified against the wrong gateway
    expect(create.body.callbackURL).toBe("https://shop.test/api/checkout?provider=bkash");
    expect(create.headers["X-APP-Key"]).toBe("app-key-1");
  });

  it("refuses an order priced in another currency", async () => {
    // bKash is a taka wallet. Sending 1500 of something else would charge
    // a different amount than the customer agreed to.
    const res = await bkashAdapter.initiate({
      order: order(),
      credentials: CREDENTIALS,
      origin: "https://shop.test",
      currency: "USD",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/BDT/);
    expect(calls.find((c) => c.path === "/create")).toBeUndefined();
  });

  it("passes bKash's refusal back rather than a blank failure", async () => {
    routes["/create"] = () => respond({ statusCode: "2001", statusMessage: "Invalid amount" });

    const res = await bkashAdapter.initiate({ order: order(), credentials: CREDENTIALS, origin: "https://shop.test" });
    expect(res).toEqual({ ok: false, error: "Invalid amount" });
  });
});

describe("reading the redirect", () => {
  it("never takes the order id from the URL", () => {
    // The redirect lands in the customer's browser, so an order id there
    // would be theirs to change — pointing a real payment at another order.
    const parsed = bkashAdapter.parseCallback(new URLSearchParams("paymentID=pay-1&status=success&orderId=deadbeef"));

    expect(parsed.orderId).toBe("");
    expect(parsed.verificationToken).toBe("pay-1");
    expect(parsed.eventId).toBe("bkash:pay-1");
  });

  it("maps bKash's statuses onto the store's", () => {
    const of = (qs) => bkashAdapter.parseCallback(new URLSearchParams(qs)).rawStatus;
    expect(of("paymentID=p&status=success")).toBe("VALID");
    expect(of("paymentID=p&status=cancel")).toBe("CANCELLED");
    expect(of("paymentID=p&status=failure")).toBe("FAILED");
    expect(of("paymentID=p")).toBe("FAILED");
  });

  it("gives the same event id for a repeated redirect", () => {
    // Which is what stops a customer refreshing the return page from
    // settling the same payment twice.
    const a = bkashAdapter.parseCallback(new URLSearchParams("paymentID=pay-1&status=success"));
    const b = bkashAdapter.parseCallback(new URLSearchParams("paymentID=pay-1&status=success"));
    expect(a.eventId).toBe(b.eventId);
  });
});

describe("confirming that money actually moved", () => {
  it("executes the payment and reports what bKash said", async () => {
    routes["/execute"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX1", amount: "1500.00", paymentID: "pay-1" });

    const res = await bkashAdapter.verify({ verificationToken: "pay-1", credentials: CREDENTIALS, expectedAmount: 1500 });

    expect(res).toMatchObject({ ok: true, paid: true, amount: 1500, transactionId: "TRX1" });
  });

  it("falls back to the status query when execute comes back unusable", async () => {
    // This is the case that costs real money if it's got wrong: execute can
    // only be called once, so a lost response must not be read as "unpaid"
    // when the customer has already been charged.
    routes["/execute"] = () => respond({ statusCode: "2062", statusMessage: "The payment has already been completed" });
    routes["/payment/status"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX1", amount: "1500.00" });

    const res = await bkashAdapter.verify({ verificationToken: "pay-1", credentials: CREDENTIALS, expectedAmount: 1500 });

    expect(res.paid).toBe(true);
    expect(res.transactionId).toBe("TRX1");
    expect(calls.some((c) => c.path === "/payment/status")).toBe(true);
  });

  it("does the same when execute times out entirely", async () => {
    routes["/execute"] = () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };
    routes["/payment/status"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX2", amount: "1500.00" });

    const res = await bkashAdapter.verify({ verificationToken: "pay-1", credentials: CREDENTIALS, expectedAmount: 1500 });
    expect(res.paid).toBe(true);
  });

  it("reports an incomplete payment as unpaid", async () => {
    routes["/execute"] = () => respond({ statusCode: "0000", transactionStatus: "Initiated", amount: "1500.00" });

    const res = await bkashAdapter.verify({ verificationToken: "pay-1", credentials: CREDENTIALS, expectedAmount: 1500 });
    expect(res.paid).toBe(false);
  });

  it("returns the amount bKash reports, not the one the order expected", async () => {
    // The route compares these two itself and refuses a mismatch. The
    // adapter's job is to report the truth, not to agree with the order.
    routes["/execute"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX1", amount: "10.00" });

    const res = await bkashAdapter.verify({ verificationToken: "pay-1", credentials: CREDENTIALS, expectedAmount: 1500 });
    expect(res.amount).toBe(10);
    expect(res.paid).toBe(true); // completed — but for the wrong amount
  });

  it("says so plainly when both calls fail", async () => {
    routes["/execute"] = () => respond({ statusCode: "2001", statusMessage: "Invalid payment ID" });
    routes["/payment/status"] = () => respond({ statusCode: "2001", statusMessage: "Invalid payment ID" });

    const res = await bkashAdapter.verify({ verificationToken: "nope", credentials: CREDENTIALS, expectedAmount: 1500 });
    expect(res).toMatchObject({ ok: false, paid: false });
    expect(res.reason).toBe("Invalid payment ID");
  });

  it("verifies nothing when there is no payment id", async () => {
    const res = await bkashAdapter.verify({ verificationToken: "", credentials: CREDENTIALS, expectedAmount: 1500 });
    expect(res).toMatchObject({ ok: true, paid: false });
    expect(calls).toHaveLength(0); // and doesn't call bKash at all
  });
});

describe("refunds", () => {
  it("refunds against the original transaction", async () => {
    routes["/payment/refund"] = () => respond({ transactionStatus: "Completed", refundTrxID: "REF1" });

    const res = await bkashAdapter.refund({
      order: { ...order(), bankTranId: "TRX1", paymentProviderRef: "pay-1" },
      amount: 500,
      credentials: CREDENTIALS,
    });

    expect(res).toEqual({ ok: true, refundId: "REF1" });
    expect(calls.find((c) => c.path === "/payment/refund").body).toMatchObject({
      paymentID: "pay-1",
      trxID: "TRX1",
      amount: "500.00",
    });
  });

  it("refuses when the order has no transaction to refund", async () => {
    const res = await bkashAdapter.refund({ order: order(), amount: 500, credentials: CREDENTIALS });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no bKash transaction/i);
  });
});

describe("configuration", () => {
  it("needs all four values before it counts as configured", () => {
    expect(bkashAdapter.isConfigured(CREDENTIALS)).toBe(true);
    for (const missing of ["appKey", "appSecret", "username", "password"]) {
      expect(bkashAdapter.isConfigured({ ...CREDENTIALS, [missing]: "" })).toBe(false);
    }
    expect(bkashAdapter.isConfigured(null)).toBe(false);
  });

  it("tests the connection without moving money", async () => {
    const res = await bkashAdapter.testConnection(CREDENTIALS);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/sandbox/);
    // granting a token is the whole test — nothing else is called
    expect(calls.map((c) => c.path)).toEqual(["/token/grant"]);
  });

  it("tells an admin which credential bKash rejected", async () => {
    routes["/token/grant"] = () => respond({ statusMessage: "Invalid Username" }, { status: 401 });
    const res = await bkashAdapter.testConnection(CREDENTIALS);
    expect(res).toEqual({ ok: false, error: "Invalid Username" });
  });

  it("uses the live host only in live mode", async () => {
    const seen = [];
    vi.stubGlobal("fetch", async (url) => {
      seen.push(String(url));
      return respond({ id_token: "t", expires_in: 3600 });
    });

    clearTokenCache();
    await grantToken({ ...CREDENTIALS, isLive: false });
    clearTokenCache();
    await grantToken({ ...CREDENTIALS, isLive: true });

    expect(seen[0]).toContain("sandbox.bka.sh");
    expect(seen[1]).toContain("tokenized.pay.bka.sh");
    expect(seen[1]).not.toContain("sandbox");
  });
});

describe("the sandbox host override", () => {
  it("redirects the sandbox when asked", async () => {
    const seen = [];
    vi.stubGlobal("fetch", async (url) => {
      seen.push(String(url));
      return respond({ id_token: "t", expires_in: 3600 });
    });
    process.env.BKASH_API_BASE = "http://127.0.0.1:4777/tokenized/checkout";

    clearTokenCache();
    await grantToken({ ...CREDENTIALS, isLive: false });
    expect(seen[0]).toContain("127.0.0.1:4777");

    // ...and is ignored entirely in live mode, so a stray environment
    // variable can never divert a real payment.
    clearTokenCache();
    await grantToken({ ...CREDENTIALS, isLive: true });
    expect(seen[1]).toContain("tokenized.pay.bka.sh");

    delete process.env.BKASH_API_BASE;
  });
});
