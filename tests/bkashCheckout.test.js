// tests/bkashCheckout.test.js
//
// The bKash money path, end to end through the real checkout route.
//
// bKash sends the customer's own browser back to the store with the result
// in the URL. That makes this the most forgeable callback the shop has:
// anybody can type it. Every test here is a way somebody could try to get
// an order marked paid without paying, plus the one case that costs the
// shop money in the other direction — a customer who really did pay being
// told they hadn't.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Settings from "@/models/Settings";
import PaymentEvent from "@/models/PaymentEvent";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const checkout = await import("@/app/api/checkout/route");
const { clearTokenCache } = await import("@/lib/payments/bkash");
const { encryptSecret } = await import("@/lib/crypto");

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-for-bkash";

// bKash's API, stubbed at the network boundary.
let routes;
const calls = [];
const respond = (body, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

let ip = 0;
const nextIp = () => `10.9.${Math.floor(++ip / 250)}.${ip % 250}`;

/** The customer coming back from bKash — a plain GET anyone could type. */
const returnFromBkash = (qs) =>
  checkout.GET(
    new Request(`http://shop.test/api/checkout?provider=bkash&${qs}`, { headers: { "x-forwarded-for": nextIp() } })
  );

let buyer, product;
let orderNo = 700;

const makeOrder = (over = {}) =>
  Order.create({
    orderNumber: `BK-00${orderNo++}`,
    user: buyer._id,
    items: [{ product: product._id, name: "Mug", price: 1500, quantity: 1 }],
    shippingAddress: { fullName: "Sumon", phone: "01711223344", address: "A", city: "Dhaka", country: "Bangladesh" },
    paymentMethod: "bkash",
    paymentStatus: "pending",
    totalAmount: 1500,
    paymentProviderRef: "pay-1",
    ...over,
  });

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await clearTestDB();
  clearTokenCache();
  calls.length = 0;

  buyer = await User.create({ name: "Buyer", email: `b${orderNo}@example.com`, password: "x".repeat(20) });
  product = await Product.create({
    name: "Mug",
    slug: `mug-${orderNo}-${Date.now()}`,
    price: 1500,
    category: "Home",
    stock: 10,
    status: "public",
  });

  // bKash switched on in Settings, the way an admin would have left it.
  await Settings.create({
    payment: {
      bkash: {
        enabled: true,
        mode: "sandbox",
        fields: {
          appKey: "app-key",
          appSecret: encryptSecret("app-secret"),
          username: "merchant",
          password: encryptSecret("merchant-pass"),
        },
      },
    },
  });

  routes = {
    "/token/grant": () => respond({ id_token: "tok", expires_in: 3600 }),
    "/execute": () => respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX1", amount: "1500.00", paymentID: "pay-1" }),
  };

  vi.stubGlobal("fetch", async (url, init) => {
    const path = String(url).replace(/^.*\/tokenized\/checkout/, "");
    calls.push({ path, body: JSON.parse(init?.body || "{}") });
    return (routes[path] || (() => respond({ statusCode: "9999", statusMessage: "not stubbed" }, 404)))();
  });
});

describe("a payment that really happened", () => {
  it("marks the order paid and sends the customer to their confirmation", async () => {
    const order = await makeOrder();

    const res = await returnFromBkash("paymentID=pay-1&status=success");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(`/order-confirmation/${order._id}`);

    const after = await Order.findById(order._id).lean();
    expect(after.paymentStatus).toBe("paid");
    expect(after.bankTranId).toBe("TRX1");
    expect(after.orderStatus).toBe("processing");
  });

  it("finds the order by the payment id the store recorded, not by the URL", async () => {
    const mine = await makeOrder({ paymentProviderRef: "pay-mine" });
    const someoneElse = await makeOrder({ paymentProviderRef: "pay-theirs", totalAmount: 1500 });

    routes["/execute"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "T", amount: "1500.00", paymentID: "pay-mine" });

    // An id in the query string is ignored entirely — it is the customer's
    // to edit, and pointing a real payment at another order is exactly what
    // that would buy them.
    await returnFromBkash(`paymentID=pay-mine&status=success&orderId=${someoneElse._id}`);

    expect((await Order.findById(mine._id).lean()).paymentStatus).toBe("paid");
    expect((await Order.findById(someoneElse._id).lean()).paymentStatus).toBe("pending");
  });
});

describe("a payment that did not", () => {
  it("ignores a success claimed in the URL when bKash says otherwise", async () => {
    const order = await makeOrder();
    // The whole attack: type the return URL yourself with status=success.
    routes["/execute"] = () => respond({ statusCode: "2001", statusMessage: "Invalid payment ID" });
    routes["/payment/status"] = () => respond({ statusCode: "2001", statusMessage: "Invalid payment ID" });

    const res = await returnFromBkash("paymentID=pay-1&status=success");

    expect((await Order.findById(order._id).lean()).paymentStatus).toBe("failed");
    expect(res.headers.get("location")).not.toContain("order-confirmation");
  });

  it("refuses a completed payment for the wrong amount", async () => {
    const order = await makeOrder({ totalAmount: 1500 });
    routes["/execute"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX1", amount: "10.00", paymentID: "pay-1" });

    await returnFromBkash("paymentID=pay-1&status=success");

    const after = await Order.findById(order._id).lean();
    expect(after.paymentStatus).toBe("failed");
  });

  it("hands the stock back when a payment fails", async () => {
    const order = await makeOrder();
    routes["/execute"] = () => respond({ statusCode: "2062", statusMessage: "failed" });
    routes["/payment/status"] = () => respond({ statusCode: "0000", transactionStatus: "Failed", amount: "1500.00" });

    await returnFromBkash("paymentID=pay-1&status=failure");

    const after = await Order.findById(order._id).lean();
    expect(after.paymentStatus).toBe("failed");
    // Stock is reserved when the order is placed; an abandoned payment that
    // never released it would quietly make the product unsellable.
    expect(after.stockReleased).toBe(true);
    expect((await Product.findById(product._id).lean()).stock).toBe(11);
  });
});

describe("a payment whose answer got lost", () => {
  it("still counts as paid when execute fails but the status query confirms it", async () => {
    // The costly direction: the customer HAS paid, and bKash's execute
    // response never arrived. Calling that a failure takes their money and
    // gives them nothing.
    const order = await makeOrder();
    routes["/execute"] = () => respond({ statusCode: "2062", statusMessage: "already completed" });
    routes["/payment/status"] = () =>
      respond({ statusCode: "0000", transactionStatus: "Completed", trxID: "TRX9", amount: "1500.00" });

    await returnFromBkash("paymentID=pay-1&status=success");

    const after = await Order.findById(order._id).lean();
    expect(after.paymentStatus).toBe("paid");
    expect(after.bankTranId).toBe("TRX9");
  });
});

describe("the same redirect arriving twice", () => {
  it("settles it once, however many times the customer refreshes", async () => {
    const order = await makeOrder();

    await returnFromBkash("paymentID=pay-1&status=success");
    const executesAfterFirst = calls.filter((c) => c.path === "/execute").length;

    const second = await returnFromBkash("paymentID=pay-1&status=success");

    // The second trip still lands the customer on their confirmation...
    expect(second.headers.get("location")).toContain("order-confirmation");
    // ...but nothing is charged or changed again.
    expect(calls.filter((c) => c.path === "/execute")).toHaveLength(executesAfterFirst);
    expect(await PaymentEvent.countDocuments({ eventId: "bkash:pay-1" })).toBe(1);
    expect((await Order.findById(order._id).lean()).paymentStatus).toBe("paid");
  });
});

describe("a redirect that belongs to nothing", () => {
  it("does not fall over on a payment id the store has never seen", async () => {
    const res = await returnFromBkash("paymentID=made-up&status=success");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/profile?payment=");
  });

  it("sends someone who just opens the URL back to the shop", async () => {
    const res = await checkout.GET(new Request("http://shop.test/api/checkout?provider=bkash"));
    expect(res.headers.get("location")).toBe("http://shop.test/");
  });
});

describe("a callback that matches no order", () => {
  it("never reports success for a payment the store knows nothing about", async () => {
    // This endpoint is public, so anybody can invent a payment id and add
    // status=success. Reporting VALID told them "Payment successful" and
    // emptied their basket, for a payment that touched nothing.
    const res = await returnFromBkash("paymentID=INVENTED&status=success");

    const location = res.headers.get("location");
    expect(location).toContain("payment=NO_ORDER");
    expect(location).not.toContain("VALID");
    expect(location).not.toContain("order-confirmation");
  });
});
