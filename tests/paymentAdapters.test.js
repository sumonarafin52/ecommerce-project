// tests/paymentAdapters.test.js
//
// The payment layer: adapter contract, replay protection, and the callback
// path that decides whether an order counts as paid.
//
// The expensive failures here are a replayed callback being processed twice
// and a forged callback being believed, so those get the most attention.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Settings from "@/models/Settings";
import PaymentEvent from "@/models/PaymentEvent";
import DownloadGrant from "@/models/DownloadGrant";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

// The SSLCommerz SDK and its validation API are both stubbed: the tests are
// about our logic, and nothing should reach the network.
const initMock = vi.fn(async () => ({ GatewayPageURL: "https://sandbox.sslcommerz.com/pay/abc123" }));
const verifyMock = vi.fn(async () => null);
vi.mock("@/lib/sslcommerz", () => ({
  SslCommerzPayment: class {
    constructor() {}
    init(...args) {
      return initMock(...args);
    }
    initiateRefund() {
      return Promise.resolve({ APIConnect: "DONE", refund_ref_id: "RF1" });
    }
  },
  getSslcommerzCredentials: async () => ({ storeId: "store", storePass: "pass", isLive: false }),
  verifySslcommerzTransaction: (...args) => verifyMock(...args),
}));

const checkout = await import("@/app/api/checkout/route");
const { claimPaymentEvent, amountsMatch } = await import("@/lib/payments/adapter");
const { getPaymentAdapter, unimplementedProviders, implementedProviders } = await import("@/lib/payments");

let ip = 0;
const nextIp = () => `10.8.${Math.floor(++ip / 250)}.${ip % 250}`;

const callback = (fields) => {
  const body = new URLSearchParams(fields).toString();
  return checkout.POST(
    new Request("http://shop.test/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": nextIp() },
      body,
    })
  );
};

const initiate = (body) =>
  checkout.POST(
    new Request("http://shop.test/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    })
  );

let buyer, product, order;
let orderNo = 900;

const makeOrder = (over = {}) =>
  Order.create({
    orderNumber: `SM-00${orderNo++}`,
    user: buyer._id,
    items: [{ product: product._id, name: "Mug", price: 1000, quantity: 1 }],
    shippingAddress: { fullName: "Sumon", phone: "01711223344", address: "A", city: "Dhaka", country: "Bangladesh" },
    paymentMethod: "sslcommerz",
    paymentStatus: "pending",
    totalAmount: 1000,
    ...over,
  });

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
  initMock.mockClear();
  verifyMock.mockReset();

  process.env.SSLCOMMERZ_STORE_ID = "store";
  process.env.SSLCOMMERZ_STORE_PASS = "pass";

  buyer = await User.create({ name: "Sumon", email: "s@test.com", password: "x".repeat(20) });
  product = await Product.create({
    name: "Mug",
    slug: `mug${Math.random()}`,
    description: "d",
    price: 1000,
    category: "Home",
    stock: 10,
  });
  await Settings.create({ general: { storeName: "Shop" } });
  order = await makeOrder();
  mockSession = { user: { id: String(buyer._id), email: buyer.email, role: "customer" } };
});

describe("the adapter registry", () => {
  it("only lists providers that actually have an implementation", () => {
    expect(implementedProviders()).toContain("sslcommerz");
    // bKash has a real adapter now (lib/payments/bkash.js), so it moved
    // from the pending list to the implemented one.
    expect(implementedProviders()).toContain("bkash");
    expect(getPaymentAdapter("bkash")).not.toBeNull();

    // these are configurable in Settings but have no adapter — the registry
    // must not claim otherwise
    const pending = unimplementedProviders().map((p) => p.id);
    expect(pending).toEqual(expect.arrayContaining(["nagad", "rocket", "stripe"]));
    expect(getPaymentAdapter("nagad")).toBeNull();
    expect(getPaymentAdapter("nonsense")).toBeNull();
  });

  it("agrees with the checkoutLive flags, so the two can't drift apart", async () => {
    // lib/paymentGateways.js declares which gateways reach checkout, and the
    // registry decides which can actually be charged. If those two ever
    // disagree, a customer is either offered a payment method that can't
    // take money, or denied one that works.
    const { PAYMENT_GATEWAYS } = await import("@/lib/paymentGateways");
    for (const g of PAYMENT_GATEWAYS) {
      if (g.id === "cod") continue; // handled by the store, not by an adapter
      expect(!!getPaymentAdapter(g.id), `${g.id}: adapter vs checkoutLive`).toBe(!!g.checkoutLive);
    }
  });

  it("exposes honest capabilities", () => {
    const a = getPaymentAdapter("sslcommerz");
    expect(a.capabilities.hostedPage).toBe(true);
    expect(a.capabilities.refunds).toBe(true);
    expect(typeof a.initiate).toBe("function");
    expect(typeof a.verify).toBe("function");
    expect(typeof a.parseCallback).toBe("function");
  });
});

describe("SSLCommerz environment configuration", () => {
  it("accepts either spelling of the store-password variable", async () => {
    const { sslcommerzConfiguredFromEnv } = await import("@/lib/paymentGateways");
    const keep = { ...process.env };

    delete process.env.SSLCOMMERZ_STORE_PASS;
    delete process.env.SSLCOMMERZ_STORE_PASSWORD;
    process.env.SSLCOMMERZ_STORE_ID = "store";
    expect(sslcommerzConfiguredFromEnv()).toBe(false);

    // the legacy name used to be accepted by the credential loader but NOT
    // by the availability check, so a store set up this way had working
    // credentials and was never offered at checkout
    process.env.SSLCOMMERZ_STORE_PASS = "secret";
    expect(sslcommerzConfiguredFromEnv()).toBe(true);

    delete process.env.SSLCOMMERZ_STORE_PASS;
    process.env.SSLCOMMERZ_STORE_PASSWORD = "secret";
    expect(sslcommerzConfiguredFromEnv()).toBe(true);

    process.env = keep;
  });
});

describe("replay protection", () => {
  it("claims an event exactly once", async () => {
    const args = { provider: "sslcommerz", eventId: "val:123", status: "VALID" };
    expect(await claimPaymentEvent(args)).toBe(true);
    expect(await claimPaymentEvent(args)).toBe(false);
    expect(await claimPaymentEvent(args)).toBe(false);
    expect(await PaymentEvent.countDocuments({ eventId: "val:123" })).toBe(1);
  });

  it("lets two different events through", async () => {
    expect(await claimPaymentEvent({ provider: "sslcommerz", eventId: "val:1" })).toBe(true);
    expect(await claimPaymentEvent({ provider: "sslcommerz", eventId: "val:2" })).toBe(true);
  });

  it("only one of two simultaneous claims wins", async () => {
    const results = await Promise.all([
      claimPaymentEvent({ provider: "sslcommerz", eventId: "race" }),
      claimPaymentEvent({ provider: "sslcommerz", eventId: "race" }),
      claimPaymentEvent({ provider: "sslcommerz", eventId: "race" }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("treats the same id from different providers as different events", async () => {
    expect(await claimPaymentEvent({ provider: "sslcommerz", eventId: "shared" })).toBe(true);
    expect(await claimPaymentEvent({ provider: "stripe", eventId: "shared" })).toBe(true);
  });
});

describe("a successful payment callback", () => {
  beforeEach(() => {
    verifyMock.mockResolvedValue({
      status: "VALID",
      tran_id: "",
      amount: 1000,
      currency_type: "BDT",
      bank_tran_id: "BANK-1",
    });
  });

  it("marks the order paid after verifying with the gateway", async () => {
    verifyMock.mockResolvedValue({
      status: "VALID",
      tran_id: String(order._id),
      amount: 1000,
      bank_tran_id: "BANK-1",
    });

    const res = await callback({ tran_id: String(order._id), status: "VALID", val_id: "V1" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(`/order-confirmation/${order._id}`);

    const after = await Order.findById(order._id);
    expect(after.paymentStatus).toBe("paid");
    expect(after.bankTranId).toBe("BANK-1");
    expect(after.orderStatus).toBe("processing");
    // the gateway was actually asked, rather than the callback believed
    expect(verifyMock).toHaveBeenCalled();
  });

  it("a replayed callback changes nothing the second time", async () => {
    verifyMock.mockResolvedValue({
      status: "VALID",
      tran_id: String(order._id),
      amount: 1000,
      bank_tran_id: "BANK-1",
    });

    await callback({ tran_id: String(order._id), status: "VALID", val_id: "V1" });
    const callsAfterFirst = verifyMock.mock.calls.length;
    const activityAfterFirst = (await Order.findById(order._id)).activity.length;

    // the gateway redelivers the identical event twice more
    await callback({ tran_id: String(order._id), status: "VALID", val_id: "V1" });
    await callback({ tran_id: String(order._id), status: "VALID", val_id: "V1" });

    const after = await Order.findById(order._id);
    expect(after.paymentStatus).toBe("paid");
    // no second verification, no duplicate activity entries
    expect(verifyMock.mock.calls.length).toBe(callsAfterFirst);
    expect(after.activity.length).toBe(activityAfterFirst);
    expect(await PaymentEvent.countDocuments({ eventId: "val:V1" })).toBe(1);
  });

  it("a replayed callback still sends the customer to their confirmation", async () => {
    verifyMock.mockResolvedValue({ status: "VALID", tran_id: String(order._id), amount: 1000 });
    await callback({ tran_id: String(order._id), status: "VALID", val_id: "V1" });
    const second = await callback({ tran_id: String(order._id), status: "VALID", val_id: "V1" });
    expect(second.headers.get("location")).toContain("/order-confirmation/");
  });

  it("does not issue a second set of download entitlements on replay", async () => {
    const DigitalProduct = (await import("@/models/DigitalProduct")).default;
    const dp = await DigitalProduct.create({
      title: "Ebook",
      fileUrl: "https://res.cloudinary.com/x/raw/upload/a.pdf",
      downloadLimit: 3,
    });
    const digital = await Product.create({
      name: "Ebook",
      slug: `eb${Math.random()}`,
      description: "d",
      price: 500,
      category: "Books",
      stock: 9,
      digitalProduct: dp._id,
    });
    const dOrder = await makeOrder({
      items: [{ product: digital._id, name: "Ebook", price: 500, quantity: 1 }],
      totalAmount: 500,
    });
    verifyMock.mockResolvedValue({ status: "VALID", tran_id: String(dOrder._id), amount: 500 });

    await callback({ tran_id: String(dOrder._id), status: "VALID", val_id: "VD1" });
    await DownloadGrant.updateOne({ order: dOrder._id }, { $set: { downloadCount: 2 } });
    await callback({ tran_id: String(dOrder._id), status: "VALID", val_id: "VD1" });

    const grants = await DownloadGrant.find({ order: dOrder._id });
    expect(grants).toHaveLength(1);
    expect(grants[0].downloadCount).toBe(2); // quota not reset
  });
});

describe("a callback that shouldn't be believed", () => {
  it("refuses a success claim the gateway doesn't confirm", async () => {
    // somebody posts status=VALID to this public endpoint themselves
    verifyMock.mockResolvedValue({ status: "FAILED", tran_id: String(order._id), amount: 1000 });
    await callback({ tran_id: String(order._id), status: "VALID", val_id: "FORGED" });

    const after = await Order.findById(order._id);
    expect(after.paymentStatus).toBe("failed");
  });

  it("refuses a validation that belongs to a different order", async () => {
    const other = await makeOrder();
    verifyMock.mockResolvedValue({ status: "VALID", tran_id: String(other._id), amount: 1000 });

    await callback({ tran_id: String(order._id), status: "VALID", val_id: "V-OTHER" });
    expect((await Order.findById(order._id)).paymentStatus).toBe("failed");
  });

  it("refuses when the amount paid doesn't match the order", async () => {
    verifyMock.mockResolvedValue({ status: "VALID", tran_id: String(order._id), amount: 1 });
    await callback({ tran_id: String(order._id), status: "VALID", val_id: "V-CHEAP" });
    expect((await Order.findById(order._id)).paymentStatus).toBe("failed");
  });

  it("refuses a success claim with no validation id at all", async () => {
    await callback({ tran_id: String(order._id), status: "VALID" });
    expect((await Order.findById(order._id)).paymentStatus).toBe("failed");
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("honours a genuine failure and returns the stock", async () => {
    const before = (await Product.findById(product._id)).stock;
    await Product.updateOne({ _id: product._id }, { $inc: { stock: -1 } }); // as reserved at order time

    await callback({ tran_id: String(order._id), status: "FAILED" });
    const after = await Order.findById(order._id);
    expect(after.paymentStatus).toBe("failed");
    expect(after.stockReleased).toBe(true);
    expect((await Product.findById(product._id)).stock).toBe(before);
  });

  it("doesn't fall over on a callback for an order that doesn't exist", async () => {
    const res = await callback({ tran_id: String(new mongoose.Types.ObjectId()), status: "VALID", val_id: "X" });
    expect(res.status).toBe(307);
    const junk = await callback({ tran_id: "not-an-id", status: "VALID", val_id: "Y" });
    expect(junk.status).toBe(307);
  });
});

describe("starting a payment", () => {
  it("returns the gateway's hosted page url", async () => {
    const res = await initiate({ orderId: String(order._id) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.url).toContain("sslcommerz.com");
  });

  it("reports an honest failure when the gateway returns no url", async () => {
    initMock.mockResolvedValueOnce({ failedreason: "Store ID is invalid" });
    const res = await initiate({ orderId: String(order._id) });
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/Store ID is invalid/);
  });

  it("refuses somebody else's order", async () => {
    const other = await User.create({ name: "Other", email: "o@test.com", password: "x".repeat(20) });
    mockSession = { user: { id: String(other._id), email: other.email, role: "customer" } };
    const res = await initiate({ orderId: String(order._id) });
    expect(res.status).toBe(403);
  });

  it("refuses an order that's already paid, and one whose stock was released", async () => {
    await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: "paid" } });
    expect((await initiate({ orderId: String(order._id) })).status).toBe(400);

    const stale = await makeOrder({ stockReleased: true });
    expect((await initiate({ orderId: String(stale._id) })).status).toBe(409);
  });

  it("sends the order's own country and the store's currency, not hard-coded ones", async () => {
    await Settings.findOneAndUpdate({}, { billing: { invoice: { currency: "USD" } } });
    const intl = await makeOrder({
      shippingAddress: { fullName: "A", phone: "1", address: "B", city: "Berlin", country: "Germany" },
    });
    await initiate({ orderId: String(intl._id) });

    const sent = initMock.mock.calls.at(-1)[0];
    expect(sent.currency).toBe("USD");
    expect(sent.cus_country).toBe("Germany");
  });
});

describe("guests can pay for their own order", () => {
  let guestOrder;
  const TOKEN = "guest-token-" + "a".repeat(30);

  beforeEach(async () => {
    guestOrder = await Order.create({
      orderNumber: `SM-G${orderNo++}`,
      guestEmail: "guest@test.com",
      guestAccessToken: TOKEN,
      items: [{ product: product._id, name: "Mug", price: 1000, quantity: 1 }],
      shippingAddress: { fullName: "Guest", phone: "01700000001", address: "B", city: "Dhaka" },
      paymentMethod: "sslcommerz",
      paymentStatus: "pending",
      totalAmount: 1000,
    });
    mockSession = null;
  });

  it("starts a payment with the order's access token", async () => {
    // Before this, a guest could place an online-payment order and then be
    // told "Login required" — unable to ever pay for it, while its stock
    // stayed reserved.
    const res = await initiate({ orderId: String(guestOrder._id), guestToken: TOKEN });
    expect(res.status).toBe(200);
    expect((await res.json()).data.url).toContain("sslcommerz.com");
    // the guest's email reaches the gateway, since there's no session to take it from
    expect(initMock.mock.calls.at(-1)[0].cus_email).toBe("guest@test.com");
  });

  it("is refused with a wrong token, and with none at all", async () => {
    expect((await initiate({ orderId: String(guestOrder._id), guestToken: "wrong-" + "b".repeat(26) })).status).toBe(403);
    expect((await initiate({ orderId: String(guestOrder._id) })).status).toBe(401);
  });

  it("carries the guest back to their order after paying", async () => {
    verifyMock.mockResolvedValue({ status: "VALID", tran_id: String(guestOrder._id), amount: 1000 });
    const res = await callback({ tran_id: String(guestOrder._id), status: "VALID", val_id: "VG1" });
    expect(res.headers.get("location")).toContain(`t=${TOKEN}`);
  });
});

describe("amount comparison", () => {
  it("allows rounding drift but not a real difference", () => {
    expect(amountsMatch(1000, 1000)).toBe(true);
    expect(amountsMatch(1000, 1000.4)).toBe(true);
    expect(amountsMatch(1000, 999)).toBe(false);
    expect(amountsMatch(1000, 1)).toBe(false);
    expect(amountsMatch(1000, undefined)).toBe(false);
    expect(amountsMatch(1000, "abc")).toBe(false);
  });
});
