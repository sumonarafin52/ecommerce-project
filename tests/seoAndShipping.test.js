// tests/seoAndShipping.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";

const { default: sitemap } = await import("@/app/sitemap");
const { POST: quote } = await import("@/app/api/shipping/quote/route");
const post = (body) => quote(new Request("http://x/api/shipping/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
let n = 0;
const make = (o = {}) => Product.create({ name: `P${++n}`, slug: `p${n}-${Date.now()}`, price: 100, category: "Tea", stock: 5, status: "public", ...o });

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => { await clearTestDB(); });

describe("sitemap", () => {
  it("lists every public product, categories and policy pages — and nothing private", async () => {
    const pub = await make();
    const draft = await make({ status: "draft" });
    const unlisted = await make({ status: "unlisted" });
    const urls = (await sitemap()).map((e) => e.url);
    // The slug URL, not the id one: the id now redirects to the slug, and a
    // sitemap full of redirects spends crawl budget for nothing.
    expect(urls.some((u) => u.endsWith(`/products/${pub.slug}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/products/${pub._id}`))).toBe(false);
    for (const hidden of [draft, unlisted]) {
      expect(urls.some((u) => u.includes(String(hidden._id)))).toBe(false);
      expect(urls.some((u) => u.includes(hidden.slug))).toBe(false);
    }
    expect(urls.some((u) => u.includes("category=Tea"))).toBe(true);
    for (const path of ["/about", "/privacy-policy", "/terms", "/return-policy", "/shipping-policy"]) {
      expect(urls.some((u) => u.endsWith(path))).toBe(true);
    }
    expect(urls.some((u) => /\/(cart|login|register)$/.test(u))).toBe(false);
  });
});

describe("shipping quote input handling", () => {
  beforeEach(async () => {
    const z = await ShippingZone.create({ name: "All", regions: [], active: true });
    await ShippingMethod.create({ name: "Std", zone: z._id, flatRate: 80, freeShippingThreshold: 1000, estimatedDelivery: "2 days", active: true });
  });

  it("returns cost, estimate and free-delivery threshold", async () => {
    const p = await make();
    const res = await (await post({ city: "Anywhere", items: [{ product: String(p._id), quantity: 1 }], subtotal: 100 })).json();
    expect(res.data.methods[0]).toMatchObject({ cost: 80, estimatedDelivery: "2 days", freeShippingThreshold: 1000 });
  });

  it("ignores malformed product ids instead of crashing (was a 500)", async () => {
    const res = await post({ city: "X", items: [{ product: "not-an-id", quantity: 1 }, { product: { $gt: "" } }], subtotal: 50 });
    expect(res.status).toBe(200);
  });

  it("survives junk values for city, subtotal and quantity", async () => {
    const res = await post({ city: { evil: 1 }, items: "nope", subtotal: "lots" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.methods[0].cost).toBe(80);
  });
});
