// tests/orders.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import User from "@/models/User";
import Discount from "@/models/Discount";
import Order from "@/models/Order";

// next-auth's getServerSession needs a real HTTP request/response context we
// don't have here — mocked so each test can control who's "logged in".
let mockSession = null;
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const { POST } = await import("@/app/api/orders/route");

function req(body) {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeCustomer() {
  return User.create({ name: "Test Customer", email: `c${Date.now()}${Math.random()}@test.com`, password: "hashedpw", role: "customer" });
}

async function makeProduct(overrides = {}) {
  return Product.create({
    name: "Test Product",
    slug: "prod-" + Date.now() + Math.random(),
    price: 100,
    category: "Test",
    stock: 10,
    status: "public",
    ...overrides,
  });
}

const baseAddress = { fullName: "Test Buyer", phone: "01700000000", address: "123 Road", city: "Dhaka" };

beforeAll(async () => {
  await startTestDB();
}, 60000);

afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("order quantity validation", () => {
  it("rejects quantity 0", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: 0 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(400);
  });

  it("rejects quantity -1", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: -1 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(400);
  });

  it("rejects quantity 1.5", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: 1.5 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed (string) quantity", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: "5" }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(400);
  });

  it("rejects quantity larger than available stock", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({ stock: 3 });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: 10 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
  });

  it("accepts a valid positive integer quantity", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({ stock: 10 });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: 2 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(201);
  });
});

describe("product visibility enforcement", () => {
  it("rejects buying a draft product", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({ status: "draft" });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(404);
  });

  it("rejects buying a private product", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({ status: "private" });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    expect(res.status).toBe(404);
  });

  it("allows an admin to include a draft product (staff manual order)", async () => {
    const admin = await User.create({ name: "Admin", email: `a${Date.now()}@test.com`, password: "x", role: "admin" });
    const customer = await makeCustomer();
    const product = await makeProduct({ status: "draft" });
    mockSession = { user: { id: admin._id.toString(), role: "admin" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod", userId: customer._id.toString() })
    );
    expect(res.status).toBe(201);
  });
});

describe("variant handling", () => {
  it("rejects an invalid/unknown variant key", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({
      options: [{ name: "Size", values: ["S", "M"] }],
      combinations: [{ key: "S", options: { Size: "S" }, price: 0, stock: 5, active: true }],
    });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1, combinationKey: "XL" }], shippingAddress: baseAddress, paymentMethod: "cod" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a variant that is out of stock even if the base product isn't", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({
      stock: 999,
      options: [{ name: "Size", values: ["S"] }],
      combinations: [{ key: "S", options: { Size: "S" }, price: 0, stock: 0, active: true }],
    });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1, combinationKey: "S" }], shippingAddress: baseAddress, paymentMethod: "cod" })
    );
    expect(res.status).toBe(409);
  });

  it("uses the variant's own price when it overrides the base price", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({
      price: 100,
      options: [{ name: "Size", values: ["L"] }],
      combinations: [{ key: "L", options: { Size: "L" }, price: 150, stock: 5, active: true }],
    });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1, combinationKey: "L" }], shippingAddress: baseAddress, paymentMethod: "cod" })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.data.items[0].price).toBe(150);
  });

  it("decrements the correct variant's stock, not the base product's", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({
      stock: 100,
      options: [{ name: "Size", values: ["S"] }],
      combinations: [{ key: "S", options: { Size: "S" }, price: 0, stock: 5, active: true }],
    });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    await POST(req({ items: [{ product: product._id.toString(), quantity: 2, combinationKey: "S" }], shippingAddress: baseAddress, paymentMethod: "cod" }));

    const reloaded = await Product.findById(product._id);
    expect(reloaded.combinations[0].stock).toBe(3);
    expect(reloaded.stock).toBe(100); // base stock untouched
  });
});

describe("coupon handling", () => {
  it("applies a valid coupon and claims one usage", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({ price: 1000 });
    const coupon = await Discount.create({ code: "SAVE10", type: "percentage", value: 10, scope: "all", active: true, usageLimit: 5, usedCount: 0 });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod", discountCode: "SAVE10" })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.data.discountAmount).toBe(100);

    const reloadedCoupon = await Discount.findById(coupon._id);
    expect(reloadedCoupon.usedCount).toBe(1);
  });

  it("rejects an exhausted coupon", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    await Discount.create({ code: "MAXED", type: "percentage", value: 10, scope: "all", active: true, usageLimit: 1, usedCount: 1 });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod", discountCode: "MAXED" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown coupon code", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const res = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod", discountCode: "NOPE" })
    );
    expect(res.status).toBe(400);
  });

  it("never lets a coupon's usedCount go negative when releasing usage", async () => {
    const user = await makeCustomer();
    const product = await makeProduct({ price: 1000 });
    // start an online-payment draft order with COUPON_A applied
    const couponA = await Discount.create({ code: "COUPON_A", type: "percentage", value: 10, scope: "all", active: true, usageLimit: 0, usedCount: 0 });
    const couponB = await Discount.create({ code: "COUPON_B", type: "percentage", value: 20, scope: "all", active: true, usageLimit: 0, usedCount: 0 });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const first = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "sslcommerz", discountCode: "COUPON_A" })
    );
    expect(first.status).toBe(201);
    let a = await Discount.findById(couponA._id);
    expect(a.usedCount).toBe(1);

    // switch the SAME pending draft to COUPON_B
    const second = await POST(
      req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "sslcommerz", discountCode: "COUPON_B" })
    );
    expect(second.status).toBe(200); // updates existing draft, not a new order

    a = await Discount.findById(couponA._id);
    const b = await Discount.findById(couponB._id);
    expect(a.usedCount).toBe(0); // released, and never negative
    expect(b.usedCount).toBe(1); // claimed
  });
});

describe("draft order reuse safety", () => {
  it("does not silently overwrite an old (outside the reuse window) pending order", async () => {
    const user = await makeCustomer();
    const productA = await makeProduct({ name: "Old Cart Item" });
    const productB = await makeProduct({ name: "New Cart Item" });
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    // create an "old" pending sslcommerz order by inserting directly and
    // backdating createdAt beyond the reuse window
    const old = await Order.create({
      orderNumber: "ORD-OLD",
      user: user._id,
      items: [{ product: productA._id, name: productA.name, quantity: 1, price: 100 }],
      shippingAddress: baseAddress,
      paymentMethod: "sslcommerz",
      baseAmount: 100,
      totalAmount: 100,
      paymentStatus: "pending",
      orderStatus: "pending",
    });
    await Order.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } }); // 1 hour ago

    const res = await POST(
      req({ items: [{ product: productB._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "sslcommerz" })
    );
    const data = await res.json();
    expect(res.status).toBe(201); // a NEW order, not a 200 update of the old one
    expect(data.data._id).not.toBe(old._id.toString());

    const reloadedOld = await Order.findById(old._id);
    expect(reloadedOld.items[0].product.toString()).toBe(productA._id.toString()); // untouched
  });

  it("does reuse a very recent pending order for the same payment flow", async () => {
    const user = await makeCustomer();
    const product = await makeProduct();
    mockSession = { user: { id: user._id.toString(), role: "customer" } };

    const first = await POST(req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "sslcommerz" }));
    const firstData = await first.json();
    expect(first.status).toBe(201);

    const second = await POST(req({ items: [{ product: product._id.toString(), quantity: 2 }], shippingAddress: baseAddress, paymentMethod: "sslcommerz" }));
    const secondData = await second.json();
    expect(second.status).toBe(200); // reused/updated, not a fresh order
    expect(secondData.data._id).toBe(firstData.data._id);
  });
});

describe("concurrency", () => {
  it("only one of two concurrent orders for the last unit succeeds", async () => {
    const userA = await makeCustomer();
    const userB = await makeCustomer();
    const product = await makeProduct({ stock: 1 });

    const place = (user) => {
      mockSession = { user: { id: user._id.toString(), role: "customer" } };
      return POST(req({ items: [{ product: product._id.toString(), quantity: 1 }], shippingAddress: baseAddress, paymentMethod: "cod" }));
    };

    const [resA, resB] = await Promise.all([place(userA), place(userB)]);
    const statuses = [resA.status, resB.status].sort();
    // one succeeds (201), the other gets a 409 conflict
    expect(statuses).toEqual([201, 409]);

    const reloaded = await Product.findById(product._id);
    expect(reloaded.stock).toBe(0);
  });
});
