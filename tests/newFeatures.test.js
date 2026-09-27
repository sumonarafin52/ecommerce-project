// tests/newFeatures.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import User from "@/models/User";
import Order from "@/models/Order";
import Notification from "@/models/Notification";
import StockAlert from "@/models/StockAlert";
import ReturnRequest from "@/models/ReturnRequest";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const { notifyBackInStock, checkLowStock } = await import("@/lib/inventoryEvents");
const alertsRoute = await import("@/app/api/stock-alerts/route");
const returnsRoute = await import("@/app/api/returns/route");
const returnRoute = await import("@/app/api/returns/[id]/route");

const post = (url, body) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const put = (url, body) =>
  new Request(`http://localhost${url}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const as = (user) => (mockSession = { user: { id: String(user._id), role: user.role, name: user.name } });
// background notifications are fire-and-forget; let them land
const settle = () => new Promise((r) => setTimeout(r, 60));

let n = 0;
const makeUser = (role = "customer") =>
  User.create({ name: `User ${++n}`, email: `u${n}_${Date.now()}@t.com`, password: "x", role });
const makeProduct = (o = {}) =>
  Product.create({ name: "Widget", slug: `w-${++n}-${Date.now()}`, price: 100, category: "C", stock: 0, status: "public", ...o });

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
});

// ---------------------------------------------------------------- stock alerts
describe("back-in-stock alerts", () => {
  it("lets a customer subscribe to a sold-out product", async () => {
    const u = await makeUser(); const p = await makeProduct({ stock: 0 }); as(u);
    const res = await alertsRoute.POST(post("/a", { product: String(p._id) }));
    expect(res.status).toBe(200);
    expect(await StockAlert.countDocuments()).toBe(1);
  });

  it("refuses to subscribe to something that's in stock", async () => {
    const u = await makeUser(); const p = await makeProduct({ stock: 5 }); as(u);
    expect((await alertsRoute.POST(post("/a", { product: String(p._id) }))).status).toBe(409);
  });

  it("refuses draft products", async () => {
    const u = await makeUser(); const p = await makeProduct({ status: "draft" }); as(u);
    expect((await alertsRoute.POST(post("/a", { product: String(p._id) }))).status).toBe(404);
  });

  it("requires sign-in", async () => {
    const p = await makeProduct(); mockSession = null;
    expect((await alertsRoute.POST(post("/a", { product: String(p._id) }))).status).toBe(401);
  });

  it("does not duplicate on repeated clicks", async () => {
    const u = await makeUser(); const p = await makeProduct(); as(u);
    await alertsRoute.POST(post("/a", { product: String(p._id) }));
    await alertsRoute.POST(post("/a", { product: String(p._id) }));
    expect(await StockAlert.countDocuments()).toBe(1);
  });

  it("notifies once on restock, and never twice", async () => {
    const u = await makeUser(); const p = await makeProduct(); as(u);
    await alertsRoute.POST(post("/a", { product: String(p._id) }));
    await Product.updateOne({ _id: p._id }, { $set: { stock: 10 } });

    expect(await notifyBackInStock(p._id)).toBe(1);
    expect(await notifyBackInStock(p._id)).toBe(0); // already notified
    expect(await Notification.countDocuments({ user: u._id, type: "stock_alert" })).toBe(1);
  });

  it("does nothing while the product is still out of stock", async () => {
    const u = await makeUser(); const p = await makeProduct(); as(u);
    await alertsRoute.POST(post("/a", { product: String(p._id) }));
    expect(await notifyBackInStock(p._id)).toBe(0);
  });

  it("only notifies for the specific variant that came back", async () => {
    const wantsM = await makeUser(); const wantsL = await makeUser();
    const p = await makeProduct({
      options: [{ name: "Size", values: ["M", "L"] }],
      combinations: [
        { key: "M", options: { Size: "M" }, stock: 0, active: true },
        { key: "L", options: { Size: "L" }, stock: 0, active: true },
      ],
    });
    as(wantsM); await alertsRoute.POST(post("/a", { product: String(p._id), combinationKey: "M" }));
    as(wantsL); await alertsRoute.POST(post("/a", { product: String(p._id), combinationKey: "L" }));

    await Product.updateOne({ _id: p._id, "combinations.key": "M" }, { $set: { "combinations.$.stock": 3 } });
    expect(await notifyBackInStock(p._id)).toBe(1);
    expect(await Notification.countDocuments({ user: wantsM._id, type: "stock_alert" })).toBe(1);
    expect(await Notification.countDocuments({ user: wantsL._id, type: "stock_alert" })).toBe(0); // L still out
  });

  it("notifies each customer exactly once even if two restocks race", async () => {
    const u = await makeUser(); const p = await makeProduct(); as(u);
    await alertsRoute.POST(post("/a", { product: String(p._id) }));
    await Product.updateOne({ _id: p._id }, { $set: { stock: 5 } });
    await Promise.all([notifyBackInStock(p._id), notifyBackInStock(p._id), notifyBackInStock(p._id)]);
    expect(await Notification.countDocuments({ user: u._id, type: "stock_alert" })).toBe(1);
  });
});

// ------------------------------------------------------------- low stock
describe("low-stock admin alerts", () => {
  it("alerts admins when a sale crosses the threshold", async () => {
    const admin = await makeUser("admin");
    const p = await makeProduct({ stock: 4, lowStockThreshold: 5 }); // was 6, sold 2
    expect(await checkLowStock([{ product: p._id, quantity: 2 }])).toBe(1);
    await settle();
    expect(await Notification.countDocuments({ user: admin._id, type: "inventory" })).toBe(1);
  });

  it("stays quiet while already below the threshold", async () => {
    await makeUser("admin");
    const p = await makeProduct({ stock: 2, lowStockThreshold: 5 }); // was 3, already low
    expect(await checkLowStock([{ product: p._id, quantity: 1 }])).toBe(0);
  });

  it("reports a sell-out distinctly", async () => {
    const admin = await makeUser("admin");
    const p = await makeProduct({ stock: 0, lowStockThreshold: 5 }); // was 3, sold 3
    await checkLowStock([{ product: p._id, quantity: 3 }]);
    await settle();
    const note = await Notification.findOne({ user: admin._id, type: "inventory" });
    expect(note.title).toBe("Sold out");
  });

  it("doesn't alert customers, only admins", async () => {
    const customer = await makeUser("customer"); await makeUser("admin");
    const p = await makeProduct({ stock: 4, lowStockThreshold: 5 });
    await checkLowStock([{ product: p._id, quantity: 2 }]);
    await settle();
    expect(await Notification.countDocuments({ user: customer._id })).toBe(0);
  });
});

// ---------------------------------------------------------------- returns
async function deliveredOrder(user, { daysAgo = 1, qty = 2, product } = {}) {
  const p = product || (await makeProduct({ stock: 10 }));
  const order = await Order.create({
    orderNumber: `ORD-${++n}`, user: user._id,
    items: [{ product: p._id, name: p.name, quantity: qty, price: 250 }],
    shippingAddress: { fullName: "A", phone: "1", address: "x", city: "Dhaka" },
    paymentMethod: "cod", baseAmount: 250 * qty, totalAmount: 250 * qty,
    paymentStatus: "paid", orderStatus: "delivered",
    deliveredAt: new Date(Date.now() - daysAgo * 86400000),
  });
  return { order, product: p };
}
const requestReturn = (order, product, quantity, reason = "damaged") =>
  returnsRoute.POST(post("/r", { orderId: String(order._id), items: [{ product: String(product._id), quantity }], reason }));

describe("customer return requests", () => {
  it("accepts a valid request and prices it from the order, not the client", async () => {
    const u = await makeUser(); as(u);
    const { order, product } = await deliveredOrder(u);
    const res = await requestReturn(order, product, 1);
    expect(res.status).toBe(201);
    const ret = await ReturnRequest.findOne();
    expect(ret.refundAmount).toBe(250);
  });

  it("rejects returns on someone else's order (as 'not found')", async () => {
    const owner = await makeUser(); const stranger = await makeUser();
    const { order, product } = await deliveredOrder(owner);
    as(stranger);
    expect((await requestReturn(order, product, 1)).status).toBe(404);
  });

  it("rejects returns before delivery", async () => {
    const u = await makeUser(); as(u);
    const { order, product } = await deliveredOrder(u);
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: "shipped" } });
    expect((await requestReturn(order, product, 1)).status).toBe(400);
  });

  it("rejects returns after the 7-day window", async () => {
    const u = await makeUser(); as(u);
    const { order, product } = await deliveredOrder(u, { daysAgo: 8 });
    const res = await requestReturn(order, product, 1);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/window/);
  });

  it("won't let the same units be returned twice", async () => {
    const u = await makeUser(); as(u);
    const { order, product } = await deliveredOrder(u, { qty: 2 });
    expect((await requestReturn(order, product, 2)).status).toBe(201);
    expect((await requestReturn(order, product, 1)).status).toBe(400);
  });

  it("allows returning the rest after a partial return", async () => {
    const u = await makeUser(); as(u);
    const { order, product } = await deliveredOrder(u, { qty: 3 });
    expect((await requestReturn(order, product, 1)).status).toBe(201);
    expect((await requestReturn(order, product, 2)).status).toBe(201);
    expect((await requestReturn(order, product, 1)).status).toBe(400);
  });

  it("frees the units again if a request is rejected", async () => {
    const u = await makeUser(); const admin = await makeUser("admin");
    const { order, product } = await deliveredOrder(u, { qty: 1 });
    as(u); await requestReturn(order, product, 1);
    const ret = await ReturnRequest.findOne();
    as(admin); await returnRoute.PUT(put("/r", { status: "rejected" }), { params: { id: String(ret._id) } });
    as(u);
    expect((await requestReturn(order, product, 1)).status).toBe(201);
  });

  it("rejects invalid quantities and reasons", async () => {
    const u = await makeUser(); as(u);
    const { order, product } = await deliveredOrder(u);
    expect((await requestReturn(order, product, 0)).status).toBe(400);
    expect((await requestReturn(order, product, 1.5)).status).toBe(400);
    expect((await requestReturn(order, product, 1, "because")).status).toBe(400);
  });
});

describe("admin return processing", () => {
  async function setup(qty = 2) {
    const u = await makeUser(); const admin = await makeUser("admin");
    const { order, product } = await deliveredOrder(u, { qty });
    as(u); await requestReturn(order, product, qty);
    const ret = await ReturnRequest.findOne();
    as(admin);
    const move = (status) => returnRoute.PUT(put("/r", { status }), { params: { id: String(ret._id) } });
    return { order, product, ret, move, admin, u };
  }

  it("blocks invalid transitions (requested → received)", async () => {
    const { move } = await setup();
    expect((await move("received")).status).toBe(400);
  });

  it("restores stock only when received — not on approval", async () => {
    const { product, move } = await setup(2);
    await move("approved");
    expect((await Product.findById(product._id)).stock).toBe(10);
    await move("received");
    expect((await Product.findById(product._id)).stock).toBe(12);
  });

  it("restores stock exactly once", async () => {
    const { product, move } = await setup(2);
    await move("approved"); await move("received");
    expect((await move("received")).status).toBe(200); // no-op, same status
    await move("refunded");
    expect((await Product.findById(product._id)).stock).toBe(12);
  });

  it("marks the order returned once everything has come back", async () => {
    const { order, move } = await setup(2);
    await move("approved"); await move("received");
    expect((await Order.findById(order._id)).orderStatus).toBe("returned");
  });

  it("does not mark the order returned after only a partial return", async () => {
    const u = await makeUser(); const admin = await makeUser("admin");
    const { order, product } = await deliveredOrder(u, { qty: 3 });
    as(u); await requestReturn(order, product, 1);
    const ret = await ReturnRequest.findOne();
    as(admin);
    await returnRoute.PUT(put("/r", { status: "approved" }), { params: { id: String(ret._id) } });
    await returnRoute.PUT(put("/r", { status: "received" }), { params: { id: String(ret._id) } });
    expect((await Order.findById(order._id)).orderStatus).toBe("delivered");
  });

  it("forbids non-staff from processing returns", async () => {
    const { ret, u } = await setup();
    as(u);
    const res = await returnRoute.PUT(put("/r", { status: "approved" }), { params: { id: String(ret._id) } });
    expect(res.status).toBe(403);
  });

  it("keeps the customer informed at each step", async () => {
    const { move, u } = await setup();
    await move("approved"); await move("received"); await move("refunded");
    await settle();
    expect(await Notification.countDocuments({ user: u._id, type: "return" })).toBe(3);
  });
});
