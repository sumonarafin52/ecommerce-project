// tests/adminSearch.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import mongoose from "mongoose";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
const { GET } = await import("@/app/api/admin/search/route");
const search = (q, raw = false) => {
  const r = GET(new Request(`http://x/api/admin/search?q=${raw ? q : encodeURIComponent(q)}`));
  return r.then((x) => x.json());
};
const as = (role) => (mockSession = { user: { id: String(new mongoose.Types.ObjectId()), role, name: "U" } });

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  as("admin");
  await Product.create({ name: "Mango Lassi", slug: `ml${Date.now()}`, price: 120, sku: "SKU-ML1", category: "Drinks", stock: 5, status: "public" });
  await Order.create({
    orderNumber: "ORD-AB123", user: new mongoose.Types.ObjectId(),
    items: [{ product: new mongoose.Types.ObjectId(), name: "X", quantity: 1, price: 10 }],
    shippingAddress: { fullName: "Nusrat Jahan", phone: "01811223344", address: "x", city: "Dhaka" },
    baseAmount: 10, totalAmount: 10, paymentMethod: "cod", paymentStatus: "pending", orderStatus: "processing",
  });
  await User.create({ name: "Karim Ahmed", email: "karim@example.com", password: "x", role: "customer" });
});

describe("admin global search", () => {
  it("finds products by name and SKU", async () => {
    expect((await search("Mango")).data.products).toHaveLength(1);
    expect((await search("SKU-ML1")).data.products).toHaveLength(1);
  });

  it("finds orders by number, customer name and phone", async () => {
    expect((await search("ORD-AB123")).data.orders).toHaveLength(1);
    expect((await search("Nusrat")).data.orders).toHaveLength(1);
    expect((await search("01811223344")).data.orders).toHaveLength(1);
  });

  it("finds customers by name and email, never staff", async () => {
    expect((await search("Karim")).data.customers).toHaveLength(1);
    expect((await search("karim@example")).data.customers).toHaveLength(1);
    await User.create({ name: "Karim Staff", email: "staff@example.com", password: "x", role: "admin" });
    expect((await search("Karim")).data.customers).toHaveLength(1); // staff excluded
  });

  it("ignores very short queries", async () => {
    const { data } = await search("M");
    expect([...data.products, ...data.orders, ...data.customers]).toHaveLength(0);
  });

  it("treats regex metacharacters as plain text, not a pattern", async () => {
    const res = await search("Mango ("); // would throw if passed to RegExp raw
    expect(res.success).toBe(true);
    expect(res.data.products).toHaveLength(0);
    const wildcard = await search(".*");
    expect(wildcard.data.products).toHaveLength(0); // must NOT match everything
  });

  it("only returns what the staff member is allowed to see", async () => {
    as("support"); // customers permission, but not products
    const { data } = await search("Mango");
    expect(data.products).toHaveLength(0);
    const cust = await search("Karim");
    expect(cust.data.customers).toHaveLength(1);
  });

  it("requires a session", async () => {
    mockSession = null;
    expect((await GET(new Request("http://x/api/admin/search?q=Mango"))).status).toBe(401);
  });
});
