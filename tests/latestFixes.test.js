// tests/latestFixes.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import User from "@/models/User";
import Order from "@/models/Order";
import Discount from "@/models/Discount";
import NewsletterSubscriber from "@/models/NewsletterSubscriber";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const newsletter = await import("@/app/api/newsletter/route");
const unsub = await import("@/app/api/newsletter/unsubscribe/route");
const orderRoute = await import("@/app/api/orders/[id]/route");
const { serverError } = await import("@/lib/apiError");

let ip = 0;
const req = (method, body, url = "http://localhost/x") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.${Math.floor(++ip / 250)}.${ip % 250}` },
    body: body ? JSON.stringify(body) : undefined,
  });
const as = (u) => (mockSession = u ? { user: { id: String(u._id), role: u.role, name: u.name } } : null);
let n = 0;
const makeUser = (role = "customer") => User.create({ name: `U ${++n}`, email: `u${n}_${Date.now()}@t.com`, password: "x", role });

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
});

// ------------------------------------------------------------ newsletter
describe("newsletter (previously a fake form that stored nothing)", () => {
  const sub = (email, extra = {}) => newsletter.POST(req("POST", { email, ...extra }));

  it("actually stores the subscriber", async () => {
    expect((await sub("a@example.com")).status).toBe(200);
    const s = await NewsletterSubscriber.findOne({ email: "a@example.com" });
    expect(s.status).toBe("subscribed");
    expect(s.unsubscribeToken).toMatch(/^[a-f0-9]{48}$/);
  });

  it("rejects an invalid email", async () => {
    expect((await sub("not-an-email")).status).toBe(400);
  });

  it("doesn't duplicate, and answers identically for new and existing (no enumeration)", async () => {
    const first = await (await sub("B@Example.com")).json();
    const again = await (await sub("b@example.com")).json();
    expect(again).toEqual(first);
    expect(await NewsletterSubscriber.countDocuments()).toBe(1);
  });

  it("drops honeypot submissions without storing", async () => {
    expect((await sub("bot@example.com", { website: "http://spam" })).status).toBe(200);
    expect(await NewsletterSubscriber.countDocuments()).toBe(0);
  });

  it("unsubscribes with a valid token, rejects bad ones", async () => {
    await sub("c@example.com");
    const { unsubscribeToken } = await NewsletterSubscriber.findOne({ email: "c@example.com" });
    expect((await unsub.POST(req("POST", { token: "nope" }))).status).toBe(400);
    expect((await unsub.POST(req("POST", { token: "a".repeat(48) }))).status).toBe(404);
    expect((await unsub.POST(req("POST", { token: unsubscribeToken }))).status).toBe(200);
    expect((await NewsletterSubscriber.findOne({ email: "c@example.com" })).status).toBe("unsubscribed");
  });

  it("re-subscribing reactivates, keeping the same unsubscribe token", async () => {
    await sub("d@example.com");
    const before = await NewsletterSubscriber.findOne({ email: "d@example.com" });
    await unsub.POST(req("POST", { token: before.unsubscribeToken }));
    await sub("d@example.com");
    const after = await NewsletterSubscriber.findOne({ email: "d@example.com" });
    expect(after.status).toBe("subscribed");
    expect(after.unsubscribeToken).toBe(before.unsubscribeToken);
  });

  it("CSV export is staff-only", async () => {
    as(await makeUser("customer"));
    expect((await newsletter.GET(req("GET", null, "http://localhost/api/newsletter?format=csv"))).status).toBe(403);
  });

  it("CSV neutralises spreadsheet formula injection and includes unsubscribe links", async () => {
    await NewsletterSubscriber.create({ email: "=cmd@example.com", unsubscribeToken: "f".repeat(48) });
    as(await makeUser("admin"));
    const res = await newsletter.GET(req("GET", null, "http://localhost/api/newsletter?format=csv"));
    const csv = await res.text();
    expect(csv).toContain(`"'=cmd@example.com"`); // leading = defused
    expect(csv).toContain("/unsubscribe?token=" + "f".repeat(48));
  });
});

// ------------------------------------------------------------ customer cancel
async function setup({ paymentStatus = "pending", orderStatus = "processing", withCoupon = false } = {}) {
  const owner = await makeUser();
  const product = await Product.create({ name: "Lamp", slug: `l-${++n}-${Date.now()}`, price: 500, category: "C", stock: 7, status: "public" });
  if (withCoupon) await Discount.create({ code: "TENOFF", type: "percentage", value: 10, scope: "all", active: true, usedCount: 4 });
  const order = await Order.create({
    orderNumber: `ORD-${++n}`, user: owner._id,
    items: [{ product: product._id, name: "Lamp", quantity: 3, price: 500 }],
    shippingAddress: { fullName: "A", phone: "1", address: "x", city: "Dhaka" },
    paymentMethod: "cod", baseAmount: 1500, totalAmount: 1500, paymentStatus, orderStatus,
    discountCode: withCoupon ? "TENOFF" : "",
  });
  const cancel = (body = {}) => orderRoute.PUT(req("PUT", { cancelByCustomer: true, ...body }), { params: { id: String(order._id) } });
  return { owner, product, order, cancel };
}

describe("customer self-cancel", () => {
  it("cancels an unshipped COD order and restores stock and the coupon slot", async () => {
    const { owner, product, order, cancel } = await setup({ withCoupon: true });
    as(owner);
    expect((await cancel({ reason: "changed my mind" })).status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("cancelled");
    expect((await Product.findById(product._id)).stock).toBe(10); // 7 + 3
    expect((await Discount.findOne({ code: "TENOFF" })).usedCount).toBe(3);
  });

  it("won't cancel someone else's order", async () => {
    const { cancel } = await setup();
    as(await makeUser());
    expect((await cancel()).status).toBe(403);
  });

  it("won't cancel a shipped order", async () => {
    const { owner, cancel } = await setup({ orderStatus: "shipped" });
    as(owner);
    expect((await cancel()).status).toBe(400);
  });

  it("sends paid orders to support instead of cancelling with the money held", async () => {
    const { owner, product, cancel } = await setup({ paymentStatus: "paid" });
    as(owner);
    const res = await cancel();
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/support/i);
    expect((await Product.findById(product._id)).stock).toBe(7); // untouched
  });

  it("never restores stock twice", async () => {
    const { owner, product, cancel } = await setup();
    as(owner);
    await cancel();
    expect((await cancel()).status).toBe(400); // already cancelled
    expect((await Product.findById(product._id)).stock).toBe(10);
  });
});

describe("staff cancel now releases the coupon slot (bug fix)", () => {
  it("returns the coupon usage when staff cancel", async () => {
    const { order } = await setup({ withCoupon: true });
    as(await makeUser("admin"));
    await orderRoute.PUT(req("PUT", { orderStatus: "cancelled" }), { params: { id: String(order._id) } });
    expect((await Discount.findOne({ code: "TENOFF" })).usedCount).toBe(3);
  });
});

describe("server errors don't leak internals (security fix)", () => {
  it("returns a generic message, never the raw error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = serverError(new Error("connect ECONNREFUSED 127.0.0.1:27999"), "test");
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.message).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|27999/);
    expect(spy).toHaveBeenCalled(); // but it IS logged server-side
    spy.mockRestore();
  });
});
