// tests/digitalProducts.test.js
//
// Covers the admin side of digital products and the shipping-requirement
// rules — including the bug where the admin form's digital-delivery select
// was silently discarded by both product routes, so nothing downloadable
// could ever actually be attached to a product.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";
import DigitalProduct from "@/models/DigitalProduct";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => true) }));

const productsRoute = await import("@/app/api/products/route");
const productOne = await import("@/app/api/products/[id]/route");
const dpRoute = await import("@/app/api/digital-products/route");
const dpOne = await import("@/app/api/digital-products/[id]/route");
const quoteRoute = await import("@/app/api/shipping/quote/route");
const { productRequiresShipping, orderRequiresShipping } = await import("@/lib/shippingRequirement");

const CLOUD = "https://res.cloudinary.com/demo/raw/upload/v1/file.pdf";

const json = (url, method, body) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.3.3.3" },
    body: JSON.stringify(body),
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
  mockSession = { user: { id: String(new mongoose.Types.ObjectId()), role: "admin" } };
});

describe("attaching a downloadable file to a product", () => {
  it("persists digitalProduct on create (it used to be dropped)", async () => {
    const dp = await DigitalProduct.create({ title: "Ebook", fileUrl: CLOUD, fileName: "file.pdf" });
    const res = await productsRoute.POST(
      json("http://x/api/products", "POST", {
        name: "Guide",
        category: "Books",
        price: 300,
        digitalProduct: String(dp._id),
      })
    );
    expect(res.status).toBe(201);
    const saved = await Product.findOne({ name: "Guide" });
    expect(String(saved.digitalProduct)).toBe(String(dp._id));
  });

  it("persists digitalProduct on update", async () => {
    const dp = await DigitalProduct.create({ title: "Ebook", fileUrl: CLOUD });
    const p = await Product.create({ name: "Guide", slug: "g1", description: "d", price: 300, category: "Books", stock: 1 });

    await productOne.PUT(json(`http://x/api/products/${p._id}`, "PUT", { digitalProduct: String(dp._id) }), {
      params: { id: String(p._id) },
    });
    expect(String((await Product.findById(p._id)).digitalProduct)).toBe(String(dp._id));

    // and can be detached again
    await productOne.PUT(json(`http://x/api/products/${p._id}`, "PUT", { digitalProduct: "" }), {
      params: { id: String(p._id) },
    });
    expect((await Product.findById(p._id)).digitalProduct).toBeNull();
  });

  it("stores null rather than casting a malformed id", async () => {
    const res = await productsRoute.POST(
      json("http://x/api/products", "POST", { name: "Bad", category: "C", price: 1, digitalProduct: "not-an-id" })
    );
    expect(res.status).toBe(201);
    expect((await Product.findOne({ name: "Bad" })).digitalProduct).toBeNull();
  });
});

describe("digital product policy fields", () => {
  it("saves limit, expiry, version, licence and multiple files", async () => {
    const res = await dpRoute.POST(
      json("http://x/api/digital-products", "POST", {
        title: "Course",
        version: "2.0",
        downloadLimit: 5,
        downloadExpiryDays: 30,
        licenseMode: "generated",
        licenseTerms: "One seat.",
        files: [
          { url: CLOUD, name: "course.zip", size: 500, type: "application/zip", label: "Main" },
          { url: CLOUD, name: "sample.pdf", size: 50, type: "application/pdf", isPreview: true },
        ],
        fileUrl: CLOUD,
        fileName: "course.zip",
      })
    );
    expect(res.status).toBe(201);
    const dp = await DigitalProduct.findOne({ title: "Course" });
    expect(dp.downloadLimit).toBe(5);
    expect(dp.downloadExpiryDays).toBe(30);
    expect(dp.version).toBe("2.0");
    expect(dp.licenseMode).toBe("generated");
    expect(dp.files).toHaveLength(2);
    expect(dp.files[1].isPreview).toBe(true);
  });

  it("refuses a file that wasn't uploaded through this store", async () => {
    // Otherwise an admin account could point a download at any URL and the
    // streaming endpoint would fetch it — including internal addresses.
    const res = await dpRoute.POST(
      json("http://x/api/digital-products", "POST", {
        title: "Sneaky",
        files: [{ url: "http://169.254.169.254/latest/meta-data/", name: "x" }],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/uploaded through this admin panel/i);
    expect(await DigitalProduct.countDocuments()).toBe(0);
  });

  it("refuses a shared licence with no key", async () => {
    const res = await dpRoute.POST(
      json("http://x/api/digital-products", "POST", { title: "L", fileUrl: CLOUD, licenseMode: "shared" })
    );
    expect(res.status).toBe(400);
  });

  it("refuses a negative download limit rather than reading it as unlimited", async () => {
    // 0 means unlimited here, so coercing -5 to 0 would turn a typo into
    // "every buyer gets unlimited downloads".
    const res = await dpRoute.POST(
      json("http://x/api/digital-products", "POST", { title: "Clamp", fileUrl: CLOUD, downloadLimit: -5 })
    );
    expect(res.status).toBe(400);
    expect(await DigitalProduct.countDocuments({ title: "Clamp" })).toBe(0);

    const bad = await dpRoute.POST(
      json("http://x/api/digital-products", "POST", { title: "Clamp3", fileUrl: CLOUD, downloadExpiryDays: "soon" })
    );
    expect(bad.status).toBe(400);
  });

  it("caps an absurd but valid limit", async () => {
    await dpRoute.POST(
      json("http://x/api/digital-products", "POST", { title: "Clamp2", fileUrl: CLOUD, downloadLimit: 1e9 })
    );
    expect((await DigitalProduct.findOne({ title: "Clamp2" })).downloadLimit).toBe(10000);
  });

  it("a partial update does not blank the fields it doesn't mention", async () => {
    const dp = await DigitalProduct.create({
      title: "Keep",
      fileUrl: CLOUD,
      licenseMode: "shared",
      licenseKey: "KEY-1",
      licenseTerms: "Terms here",
      downloadLimit: 4,
    });
    const res = await dpOne.PUT(json(`http://x/api/digital-products/${dp._id}`, "PUT", { active: false }), {
      params: { id: String(dp._id) },
    });
    expect(res.status).toBe(200);
    const after = await DigitalProduct.findById(dp._id);
    expect(after.active).toBe(false);
    expect(after.licenseKey).toBe("KEY-1");
    expect(after.licenseTerms).toBe("Terms here");
    expect(after.downloadLimit).toBe(4);
    expect(after.fileUrl).toBe(CLOUD);
  });
});

describe("shipping requirement", () => {
  it("auto: physical products ship, digital ones don't", () => {
    expect(productRequiresShipping({ shippingRequirement: "auto", digitalProduct: null })).toBe(true);
    expect(productRequiresShipping({ shippingRequirement: "auto", digitalProduct: "abc" })).toBe(false);
  });

  it("overrides win over auto", () => {
    expect(productRequiresShipping({ shippingRequirement: "always", digitalProduct: "abc" })).toBe(true);
    expect(productRequiresShipping({ shippingRequirement: "never", digitalProduct: null })).toBe(false);
  });

  it("a mixed cart still ships, because the physical half has to arrive", () => {
    expect(
      orderRequiresShipping([
        { shippingRequirement: "auto", digitalProduct: "abc" },
        { shippingRequirement: "auto", digitalProduct: null },
      ])
    ).toBe(true);
  });

  it("falls back to 'ships' when nothing resolved, rather than giving away delivery", () => {
    expect(orderRequiresShipping([])).toBe(true);
    expect(orderRequiresShipping(null)).toBe(true);
    expect(productRequiresShipping(null)).toBe(true);
  });
});

describe("shipping quote for a download-only cart", () => {
  it("reports requiresShipping:false instead of an empty courier list", async () => {
    const dp = await DigitalProduct.create({ title: "Ebook", fileUrl: CLOUD });
    const p = await Product.create({
      name: "Ebook",
      slug: "eb",
      description: "d",
      price: 200,
      category: "Books",
      stock: 10,
      digitalProduct: dp._id,
    });

    const res = await quoteRoute.POST(
      json("http://x/api/shipping/quote", "POST", {
        city: "Savar",
        items: [{ product: String(p._id), quantity: 1 }],
        subtotal: 200,
      })
    );
    const body = await res.json();
    expect(body.data.requiresShipping).toBe(false);
    expect(body.data.methods).toEqual([]);
  });

  it("still quotes couriers for a physical cart", async () => {
    const zone = await ShippingZone.create({ name: "Dhaka", regions: ["Savar"], active: true });
    await ShippingMethod.create({ name: "Standard", zone: zone._id, active: true, rateType: "flat", flatRate: 60 });
    const p = await Product.create({
      name: "Mug",
      slug: "mug",
      description: "d",
      price: 400,
      category: "Home",
      stock: 10,
    });

    const res = await quoteRoute.POST(
      json("http://x/api/shipping/quote", "POST", {
        city: "Savar",
        items: [{ product: String(p._id), quantity: 1 }],
        subtotal: 400,
      })
    );
    const body = await res.json();
    expect(body.data.requiresShipping).toBe(true);
    expect(body.data.methods).toHaveLength(1);
    expect(body.data.methods[0].cost).toBe(60);
  });
});

describe("a download-only order needs no address", () => {
  it("saves without address or city", async () => {
    const order = await Order.create({
      orderNumber: "ORD-D1",
      user: new mongoose.Types.ObjectId(),
      items: [{ product: new mongoose.Types.ObjectId(), name: "Ebook", price: 200, quantity: 1 }],
      // name and phone only — no street, no city
      shippingAddress: { fullName: "Buyer", phone: "01700000000" },
      requiresShipping: false,
      paymentMethod: "sslcommerz",
      totalAmount: 200,
    });
    expect(order._id).toBeTruthy();
    expect(order.shippingAddress.city).toBeUndefined();
  });

  it("but a physical order still cannot", async () => {
    await expect(
      Order.create({
        orderNumber: "ORD-D2",
        user: new mongoose.Types.ObjectId(),
        items: [{ product: new mongoose.Types.ObjectId(), name: "Mug", price: 400, quantity: 1 }],
        shippingAddress: { fullName: "Buyer", phone: "01700000000" },
        requiresShipping: true,
        paymentMethod: "cod",
        totalAmount: 400,
      })
    ).rejects.toThrow();
  });

  it("defaults to requiring shipping when the field is absent", async () => {
    await expect(
      Order.create({
        orderNumber: "ORD-D3",
        user: new mongoose.Types.ObjectId(),
        items: [{ product: new mongoose.Types.ObjectId(), name: "Mug", price: 400, quantity: 1 }],
        shippingAddress: { fullName: "Buyer", phone: "01700000000" },
        paymentMethod: "cod",
        totalAmount: 400,
      })
    ).rejects.toThrow();
  });
});
