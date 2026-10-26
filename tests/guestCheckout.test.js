// tests/guestCheckout.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import Settings from "@/models/Settings";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
const orders = await import("@/app/api/orders/route");
const orderOne = await import("@/app/api/orders/[id]/route");

let ip = 0;
const post = (body) =>
  orders.POST(new Request("http://x/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.5.${Math.floor(++ip / 250)}.${ip % 250}` },
    body: JSON.stringify(body),
  }));
const getOrder = (id, token) =>
  orderOne.GET(new Request(`http://x/api/orders/${id}${token ? `?t=${token}` : ""}`), { params: { id: String(id) } });

const setMode = (guestCheckout) => Settings.findOneAndUpdate({}, { checkout: { guestCheckout } }, { upsert: true });
let product;
const basket = (extra = {}) => ({
  items: [{ product: String(product._id), quantity: 1 }],
  shippingAddress: { fullName: "Guest Buyer", phone: "01811223344", address: "House 1", city: "Dhaka" },
  paymentMethod: "cod",
  ...extra,
});

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
  mockSession = null;
  product = await Product.create({ name: "Tea", slug: `t${Date.now()}`, price: 100, category: "C", stock: 20, status: "public" });
});

describe("guest checkout", () => {
  it("is OFF by default — a guest still has to sign in", async () => {
    const res = await post(basket({ guestEmail: "g@example.com" }));
    expect(res.status).toBe(401);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("lets a guest order once enabled, and records their email", async () => {
    await setMode("cod");
    const res = await post(basket({ guestEmail: "G@Example.com " }));
    expect(res.status).toBe(201);
    const order = await Order.findOne().select("+guestAccessToken");
    expect(order.user).toBeNull();
    expect(order.guestEmail).toBe("g@example.com"); // normalised
    expect(order.guestAccessToken).toMatch(/^[a-f0-9]{48}$/);
  });

  it("requires a valid email from guests", async () => {
    await setMode("cod");
    expect((await post(basket({ guestEmail: "" }))).status).toBe(400);
    expect((await post(basket({ guestEmail: "not-an-email" }))).status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("in COD-only mode, refuses online payment for guests", async () => {
    await setMode("cod");
    const res = await post(basket({ guestEmail: "g@example.com", paymentMethod: "sslcommerz" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/sign in|cash on delivery/i);
  });

  it("allows online payment for guests in 'all' mode", async () => {
    await setMode("all");
    expect((await post(basket({ guestEmail: "g@example.com", paymentMethod: "sslcommerz" }))).status).toBe(201);
  });

  it("a guest can open their own order with the token, and nobody else can", async () => {
    await setMode("cod");
    await post(basket({ guestEmail: "g@example.com" }));
    const order = await Order.findOne().select("+guestAccessToken");

    expect((await getOrder(order._id, order.guestAccessToken)).status).toBe(200);
    expect((await getOrder(order._id)).status).toBe(401);               // no token at all
    expect((await getOrder(order._id, "wrong-token")).status).toBe(403); // wrong token
  });

  it("never returns the access token to the browser", async () => {
    await setMode("cod");
    await post(basket({ guestEmail: "g@example.com" }));
    const order = await Order.findOne().select("+guestAccessToken");
    const body = await (await getOrder(order._id, order.guestAccessToken)).json();
    expect(body.data.guestAccessToken).toBeUndefined();
  });

  it("a signed-in customer can't read a guest order with a guessed id", async () => {
    await setMode("cod");
    await post(basket({ guestEmail: "g@example.com" }));
    const order = await Order.findOne();
    const other = await User.create({ name: "Nosy", email: `n${Date.now()}@t.com`, password: "x", role: "customer" });
    mockSession = { user: { id: String(other._id), role: "customer", name: "Nosy" } };
    expect((await getOrder(order._id)).status).toBe(403);
  });

  it("staff can still open guest orders", async () => {
    await setMode("cod");
    await post(basket({ guestEmail: "g@example.com" }));
    const order = await Order.findOne();
    const staff = await User.create({ name: "Admin", email: `a${Date.now()}@t.com`, password: "x", role: "admin" });
    mockSession = { user: { id: String(staff._id), role: "admin", name: "Admin" } };
    expect((await getOrder(order._id)).status).toBe(200);
  });

  it("signed-in checkout is unaffected", async () => {
    await setMode("cod");
    const customer = await User.create({ name: "Rahim", email: `r${Date.now()}@t.com`, password: "x", role: "customer" });
    mockSession = { user: { id: String(customer._id), role: "customer", name: "Rahim" } };
    const res = await post(basket());
    expect(res.status).toBe(201);
    const order = await Order.findOne();
    expect(String(order.user)).toBe(String(customer._id));
    expect(order.guestEmail).toBe("");
  });

  it("an order can never be created without an owner", async () => {
    await expect(Order.create({
      orderNumber: "X-1", items: [{ product: product._id, name: "Tea", quantity: 1, price: 1 }],
      shippingAddress: { fullName: "A", phone: "1", address: "x", city: "D" },
      baseAmount: 1, totalAmount: 1, paymentMethod: "cod",
    })).rejects.toThrow(/customer account or a guest email/);
  });
});
