// tests/taxIntegration.test.js
//
// Tax as the customer actually meets it: placed through the real order
// route, stored on the order, and never taken from the client.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import Settings from "@/models/Settings";
import TaxZone from "@/models/TaxZone";
import TaxRate from "@/models/TaxRate";
import DigitalProduct from "@/models/DigitalProduct";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const orders = await import("@/app/api/orders/route");
const taxQuote = await import("@/app/api/tax/quote/route");

let ip = 0;
const nextIp = () => `10.4.${Math.floor(++ip / 250)}.${ip % 250}`;

const place = (body) =>
  orders.POST(
    new Request("http://x/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    })
  );

const quote = (body) =>
  taxQuote.POST(
    new Request("http://x/api/tax/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    })
  );

let buyer, product;

const basket = (over = {}) => ({
  items: [{ product: String(product._id), quantity: 1 }],
  shippingAddress: {
    fullName: "Sumon Arafin",
    phone: "01711223344",
    address: "Bazar Road",
    city: "Savar",
    country: "Bangladesh",
    state: "Dhaka District",
  },
  paymentMethod: "cod",
  ...over,
});

async function enableTax({ pricesIncludeTax, rate = 15, appliesTo = "all" }) {
  await Settings.findOneAndUpdate(
    {},
    { tax: { enabled: true, pricesIncludeTax, basedOn: "shipping", storeCountry: "Bangladesh" } },
    { upsert: true }
  );
  const zone = await TaxZone.create({ name: "Bangladesh", countries: ["Bangladesh"], active: true });
  await TaxRate.create({ zone: zone._id, name: "VAT", rate, appliesTo, active: true });
  return zone;
}

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
  buyer = await User.create({ name: "Sumon Arafin", email: "s@test.com", password: "x".repeat(20) });
  product = await Product.create({
    name: "Mug",
    slug: `mug${Math.random()}`,
    description: "d",
    price: 1000,
    category: "Home",
    stock: 50,
  });
  mockSession = { user: { id: String(buyer._id), name: buyer.name, role: "customer" } };
});

describe("tax on a placed order", () => {
  it("adds tax to the total under exclusive pricing", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 15 });
    const res = await place(basket());
    expect(res.status).toBe(201);

    const order = await Order.findOne({ user: buyer._id });
    expect(order.taxTotal).toBe(150);
    expect(order.totalAmount).toBe(1150);
    expect(order.pricesIncludeTax).toBe(false);
    expect(order.taxLines[0].name).toBe("VAT");
    expect(order.taxZoneName).toBe("Bangladesh");
  });

  it("leaves the total alone under inclusive pricing, but records the tax", async () => {
    await enableTax({ pricesIncludeTax: true, rate: 15 });
    await place(basket());

    const order = await Order.findOne({ user: buyer._id });
    // the customer pays the shelf price — this is the case where getting
    // it wrong would overcharge every single order by 15%
    expect(order.totalAmount).toBe(1000);
    expect(order.taxTotal).toBeCloseTo(130.43, 2);
    expect(order.pricesIncludeTax).toBe(true);
  });

  it("charges nothing when tax is switched off", async () => {
    const res = await place(basket());
    expect(res.status).toBe(201);
    const order = await Order.findOne({ user: buyer._id });
    expect(order.taxTotal).toBe(0);
    expect(order.totalAmount).toBe(1000);
  });

  it("charges nothing when no zone covers the address", async () => {
    await Settings.findOneAndUpdate({}, { tax: { enabled: true, pricesIncludeTax: false } }, { upsert: true });
    await TaxZone.create({ name: "EU only", countries: ["Germany"], active: true }).then((z) =>
      TaxRate.create({ zone: z._id, name: "VAT", rate: 19, active: true })
    );
    await place(basket());
    const order = await Order.findOne({ user: buyer._id });
    expect(order.taxTotal).toBe(0);
    expect(order.totalAmount).toBe(1000);
  });
});

describe("the client cannot influence the tax", () => {
  it("ignores a tax figure sent in the request body", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 15 });
    await place(basket({ taxTotal: 0, taxLines: [], totalAmount: 1 }));

    const order = await Order.findOne({ user: buyer._id });
    // the server's own figure, not the one the client asked for
    expect(order.taxTotal).toBe(150);
    expect(order.totalAmount).toBe(1150);
  });

  it("uses the address on the order, not a tax zone named by the client", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 15 });
    await place(basket({ taxZoneName: "Tax Free Zone" }));
    const order = await Order.findOne({ user: buyer._id });
    expect(order.taxZoneName).toBe("Bangladesh");
    expect(order.taxTotal).toBe(150);
  });
});

describe("digital goods", () => {
  let ebook;

  beforeEach(async () => {
    const dp = await DigitalProduct.create({
      title: "Ebook",
      fileUrl: "https://res.cloudinary.com/demo/raw/upload/a.pdf",
    });
    ebook = await Product.create({
      name: "Ebook",
      slug: `eb${Math.random()}`,
      description: "d",
      price: 500,
      category: "Books",
      stock: 99,
      digitalProduct: dp._id,
    });
  });

  it("a digital-only rate taxes the download and not the mug", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 10, appliesTo: "digital" });
    await place(
      basket({
        items: [
          { product: String(product._id), quantity: 1 },
          { product: String(ebook._id), quantity: 1 },
        ],
      })
    );

    const order = await Order.findOne({ user: buyer._id });
    expect(order.taxTotal).toBe(50); // 10% of the 500 ebook only
    expect(order.totalAmount).toBe(1550);
  });

  it("a download-only order still gets taxed, using the store's own location", async () => {
    await Settings.findOneAndUpdate(
      {},
      { tax: { enabled: true, pricesIncludeTax: false, basedOn: "shipping", storeCountry: "Bangladesh" } },
      { upsert: true }
    );
    const zone = await TaxZone.create({ name: "Bangladesh", countries: ["Bangladesh"], active: true });
    await TaxRate.create({ zone: zone._id, name: "VAT", rate: 15, active: true });

    // no address fields beyond name and phone — a digital order doesn't collect one
    const res = await place({
      items: [{ product: String(ebook._id), quantity: 1 }],
      shippingAddress: { fullName: "Sumon Arafin", phone: "01711223344" },
      paymentMethod: "cod",
    });
    expect(res.status).toBe(201);

    const order = await Order.findOne({ user: buyer._id });
    expect(order.requiresShipping).toBe(false);
    expect(order.taxTotal).toBe(75); // the store's country decided it
  });
});

describe("the checkout preview matches what gets charged", () => {
  it("quotes the same figure the order ends up with", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 15 });

    const q = await (
      await quote({
        items: [{ product: String(product._id), quantity: 2 }],
        country: "Bangladesh",
        state: "Dhaka District",
      })
    ).json();
    expect(q.data.taxTotal).toBe(300);

    await place(basket({ items: [{ product: String(product._id), quantity: 2 }] }));
    const order = await Order.findOne({ user: buyer._id });
    expect(order.taxTotal).toBe(q.data.taxTotal);
  });

  it("prices the quote from the database, not from the request", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 10 });
    const q = await (
      await quote({
        items: [{ product: String(product._id), quantity: 1, price: 999999 }],
        country: "Bangladesh",
      })
    ).json();
    // 10% of the real 1000, not of the price the client invented
    expect(q.data.taxTotal).toBe(100);
  });

  it("reports disabled rather than guessing when tax is off", async () => {
    const q = await (await quote({ items: [{ product: String(product._id), quantity: 1 }] })).json();
    expect(q.data.enabled).toBe(false);
    expect(q.data.taxTotal).toBe(0);
  });

  it("survives a malformed cart without erroring", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 15 });
    for (const items of [null, "nope", [{ product: "bad-id", quantity: 1 }], []]) {
      const res = await quote({ items, country: "Bangladesh" });
      expect(res.status).toBe(200);
      expect((await res.json()).data.taxTotal).toBe(0);
    }
  });
});

describe("tax interacts correctly with shipping and discounts", () => {
  it("is charged on the discounted amount", async () => {
    await enableTax({ pricesIncludeTax: false, rate: 10 });
    const Discount = (await import("@/models/Discount")).default;
    await Discount.create({
      code: "HALF",
      type: "percentage",
      value: 50,
      scope: "all",
      active: true,
      usageLimit: 10,
      usedCount: 0,
    });

    await place(basket({ discountCode: "HALF" }));
    const order = await Order.findOne({ user: buyer._id });
    expect(order.discountAmount).toBe(500);
    expect(order.taxTotal).toBe(50); // 10% of 500, not of 1000
    expect(order.totalAmount).toBe(550);
  });
});
