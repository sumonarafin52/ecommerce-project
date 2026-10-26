// tests/adminScale.test.js
//
// Figures the admin panel shows, checked against a store with more orders
// than any single query returns.
//
// /api/orders caps at 100. Three separate parts of the admin read that
// endpoint and counted the array: the dashboard (fixed earlier), the sidebar
// badge, and the customers page. On a store with 5,000 orders the badge read
// "52 need attention" against a real 2,000, and 392 of 400 customers with
// purchase history showed as having never ordered.
//
// Every figure here is compared against one computed independently from the
// whole collection, so a future query limit can't quietly cap them again.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import User from "@/models/User";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
let permitted = true;
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => permitted) }));

const countsRoute = await import("@/app/api/admin/orders/counts/route");
const usersRoute = await import("@/app/api/users/route");

// Comfortably past the 100-order limit that caused all three bugs.
const ORDERS = 260;
const CUSTOMERS = 12;

let customers;

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  permitted = true;
  mockSession = { user: { id: String(new mongoose.Types.ObjectId()), role: "admin" } };

  customers = await User.insertMany(
    Array.from({ length: CUSTOMERS }, (_, i) => ({
      name: `Customer ${i}`,
      email: `c${i}@test.com`,
      password: "x".repeat(20),
      role: "customer",
    }))
  );

  const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
  const docs = Array.from({ length: ORDERS }, (_, i) => ({
    orderNumber: `SM-${200000 + i}`,
    user: customers[i % CUSTOMERS]._id,
    items: [{ product: new mongoose.Types.ObjectId(), name: "Thing", price: 100, quantity: 1 }],
    shippingAddress: { fullName: "C", phone: "01700000000", address: "A", city: "Dhaka" },
    paymentMethod: "cod",
    paymentStatus: "paid",
    orderStatus: statuses[i % statuses.length],
    totalAmount: 100,
    createdAt: new Date(Date.now() - i * 3600_000),
    updatedAt: new Date(),
  }));
  await Order.collection.insertMany(docs);
});

describe("sidebar order counts", () => {
  it("counts every order, not just the newest page of them", async () => {
    const { data } = await (await countsRoute.GET()).json();

    const realTotal = await Order.countDocuments();
    const realPending = await Order.countDocuments({ orderStatus: { $in: ["pending", "processing"] } });

    expect(data.total).toBe(realTotal);
    expect(data.needsAttention).toBe(realPending);
    // the top header's "ready to pack" figure had the same cap
    expect(data.awaitingFulfilment).toBe(
      await Order.countDocuments({ orderStatus: "processing", paymentStatus: "paid" })
    );
    // and the figures are past the limit that used to cap them
    expect(data.total).toBeGreaterThan(100);
    expect(data.needsAttention).toBeGreaterThan(0);
  });

  it("tells staff without the orders permission nothing, rather than erroring", async () => {
    permitted = false;
    const res = await countsRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ total: 0, needsAttention: 0, awaitingFulfilment: 0 });
  });

  it("requires a session", async () => {
    mockSession = null;
    expect((await countsRoute.GET()).status).toBe(401);
  });
});

describe("customer order history and lifetime spend", () => {
  const getUsers = () => usersRoute.GET(new Request("http://x/api/users"));

  it("reports each customer's real totals, across all their orders", async () => {
    const { data } = await (await getUsers()).json();
    const rows = data.filter((u) => u.role === "customer");
    expect(rows).toHaveLength(CUSTOMERS);

    // every customer here has ordered — none may read as zero
    expect(rows.every((u) => u.orderCount > 0)).toBe(true);

    for (const u of rows.slice(0, 4)) {
      const real = await Order.countDocuments({ user: u._id });
      expect(u.orderCount, u.email).toBe(real);
    }
  });

  it("excludes cancelled and returned orders from lifetime spend", async () => {
    const customer = customers[0];
    await Order.collection.deleteMany({ user: customer._id });
    await Order.collection.insertMany([
      { orderNumber: "SM-A1", user: customer._id, items: [], shippingAddress: { fullName: "C", phone: "1", address: "A", city: "D" }, paymentMethod: "cod", orderStatus: "delivered", paymentStatus: "paid", totalAmount: 1000, createdAt: new Date(), updatedAt: new Date() },
      { orderNumber: "SM-A2", user: customer._id, items: [], shippingAddress: { fullName: "C", phone: "1", address: "A", city: "D" }, paymentMethod: "cod", orderStatus: "cancelled", paymentStatus: "paid", totalAmount: 500, createdAt: new Date(), updatedAt: new Date() },
      { orderNumber: "SM-A3", user: customer._id, items: [], shippingAddress: { fullName: "C", phone: "1", address: "A", city: "D" }, paymentMethod: "cod", orderStatus: "returned", paymentStatus: "paid", totalAmount: 700, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const { data } = await (await getUsers()).json();
    const row = data.find((u) => String(u._id) === String(customer._id));
    expect(row.orderCount).toBe(3); // they did place three
    expect(row.spent).toBe(1000); // but only one counts as revenue
  });

  it("subtracts a partial refund from what a customer is worth", async () => {
    const customer = customers[1];
    await Order.collection.deleteMany({ user: customer._id });
    await Order.collection.insertOne({
      orderNumber: "SM-B1",
      user: customer._id,
      items: [],
      shippingAddress: { fullName: "C", phone: "1", address: "A", city: "D" },
      paymentMethod: "cod",
      orderStatus: "delivered",
      paymentStatus: "paid",
      totalAmount: 1000,
      refund: { amount: 300 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { data } = await (await getUsers()).json();
    expect(data.find((u) => String(u._id) === String(customer._id)).spent).toBe(700);
  });

  it("shows zero for a customer who genuinely hasn't ordered", async () => {
    const fresh = await User.create({ name: "New", email: "new@test.com", password: "x".repeat(20), role: "customer" });
    const { data } = await (await getUsers()).json();
    const row = data.find((u) => String(u._id) === String(fresh._id));
    expect(row.orderCount).toBe(0);
    expect(row.spent).toBe(0);
    expect(row.lastOrderAt).toBeNull();
  });

  it("stays behind the customers permission", async () => {
    permitted = false;
    expect((await getUsers()).status).toBe(403);
  });
});
