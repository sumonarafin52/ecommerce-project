// tests/storeReadiness.test.js
//
// The readiness check exists because of a real, silent failure: with Cash on
// Delivery switched off and SSLCommerz not configured, the storefront's
// checkout said "No payment methods are currently available" while the admin
// dashboard looked perfectly healthy. These tests pin that exact scenario
// and the honest-reporting rules around it.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Settings from "@/models/Settings";
import Product from "@/models/Product";
import DigitalProduct from "@/models/DigitalProduct";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";

let mockSession = { user: { id: "admin1", role: "admin" } };
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
let permitted = true;
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => permitted) }));

const route = await import("@/app/api/admin/readiness/route");
const get = async () => (await route.GET()).json();

const ids = (data) => data.issues.map((i) => i.id);

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
  mockSession = { user: { id: "admin1", role: "admin" } };
  permitted = true;
  delete process.env.SSLCOMMERZ_STORE_ID;
  delete process.env.SSLCOMMERZ_STORE_PASSWORD;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  process.env.NEXTAUTH_SECRET = "test-secret";
});

const publishPhysical = () =>
  Product.create({ name: "Mug", slug: `m${Math.random()}`, description: "d", price: 400, category: "Home", stock: 5 });

describe("the reported failure: nothing can be paid with", () => {
  it("reports a blocker when COD is off and no gateway is configured", async () => {
    await Settings.create({ payment: { cod: { enabled: false } } });
    await publishPhysical();

    const { data } = await get();
    expect(data.canAcceptOrders).toBe(false);
    expect(ids(data)).toContain("no_payment_method");
    expect(data.facts.enabledPaymentMethods).toEqual([]);
  });

  it("clears once COD is turned back on", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    await publishPhysical();
    await ShippingZone.create({ name: "All", regions: [], active: true }).then((z) =>
      ShippingMethod.create({ name: "Std", zone: z._id, active: true, rateType: "flat", flatRate: 60 })
    );

    const { data } = await get();
    expect(ids(data)).not.toContain("no_payment_method");
    expect(data.canAcceptOrders).toBe(true);
  });
});

describe("shipping", () => {
  it("blocks when physical products exist but no zone does", async () => {
    await Settings.create({});
    await publishPhysical();
    const { data } = await get();
    expect(ids(data)).toContain("no_shipping");
    expect(data.canAcceptOrders).toBe(false);
  });

  it("does NOT block a download-only store, which has nothing to deliver", async () => {
    await Settings.create({});
    const dp = await DigitalProduct.create({ title: "Ebook", fileUrl: "https://res.cloudinary.com/x/raw/upload/a.pdf" });
    await Product.create({
      name: "Ebook",
      slug: "eb",
      description: "d",
      price: 200,
      category: "Books",
      stock: 9,
      digitalProduct: dp._id,
    });

    const { data } = await get();
    expect(ids(data)).not.toContain("no_shipping");
    expect(data.facts.physicalProducts).toBe(0);
    expect(data.facts.digitalProducts).toBe(1);
  });

  it("blocks when zones exist but no active method does", async () => {
    await Settings.create({});
    await publishPhysical();
    await ShippingZone.create({ name: "Dhaka", regions: ["Savar"], active: true });
    const { data } = await get();
    expect(ids(data)).toContain("no_shipping");
  });
});

describe("warnings vs blockers", () => {
  it("COD-only is a warning, not a blocker — the store can still sell", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    await publishPhysical();
    const z = await ShippingZone.create({ name: "All", regions: [], active: true });
    await ShippingMethod.create({ name: "Std", zone: z._id, active: true, rateType: "flat", flatRate: 60 });

    const { data } = await get();
    expect(data.canAcceptOrders).toBe(true);
    const codOnly = data.issues.find((i) => i.id === "cod_only");
    expect(codOnly.level).toBe("warning");
  });

  it("warns that downloads can't auto-deliver on a COD-only store", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    const dp = await DigitalProduct.create({ title: "E", fileUrl: "https://res.cloudinary.com/x/raw/upload/a.pdf" });
    await Product.create({
      name: "E",
      slug: "e1",
      description: "d",
      price: 100,
      category: "Books",
      stock: 1,
      digitalProduct: dp._id,
    });

    const { data } = await get();
    expect(ids(data)).toContain("digital_needs_online_payment");
  });

  it("flags a switched-off digital product that a product still points at", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    await DigitalProduct.create({
      title: "Off",
      fileUrl: "https://res.cloudinary.com/x/raw/upload/a.pdf",
      active: false,
    });
    const { data } = await get();
    expect(ids(data)).toContain("inactive_digital_products");
  });

  it("notes missing email configuration", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    const { data } = await get();
    expect(ids(data)).toContain("no_email");

    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "me";
    const second = await get();
    expect(ids(second.data)).not.toContain("no_email");
  });
});

describe("empty store", () => {
  it("reports no published products as a blocker", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    const { data } = await get();
    expect(ids(data)).toContain("no_public_products");
    expect(data.canAcceptOrders).toBe(false);
  });

  it("does not count drafts or private products as published", async () => {
    await Settings.create({ payment: { cod: { enabled: true } } });
    await Product.create({ name: "D", slug: "d1", description: "d", price: 1, category: "C", stock: 1, status: "draft" });
    await Product.create({ name: "P", slug: "p1", description: "d", price: 1, category: "C", stock: 1, status: "private" });
    const { data } = await get();
    expect(data.facts.publicProducts).toBe(0);
    expect(ids(data)).toContain("no_public_products");
  });
});

describe("a fully configured store reports nothing", () => {
  it("returns no issues at all", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "me";
    process.env.SSLCOMMERZ_STORE_ID = "store";
    process.env.SSLCOMMERZ_STORE_PASSWORD = "pass";
    await Settings.create({ payment: { cod: { enabled: true } } });
    await publishPhysical();
    const z = await ShippingZone.create({ name: "All", regions: [], active: true });
    await ShippingMethod.create({ name: "Std", zone: z._id, active: true, rateType: "flat", flatRate: 60 });

    const { data } = await get();
    expect(data.canAcceptOrders).toBe(true);
    expect(data.issues).toEqual([]);
  });
});

describe("access control", () => {
  it("refuses an anonymous caller", async () => {
    mockSession = null;
    expect((await route.GET()).status).toBe(401);
  });

  it("refuses a staff member without dashboard permission", async () => {
    permitted = false;
    expect((await route.GET()).status).toBe(403);
  });
});
