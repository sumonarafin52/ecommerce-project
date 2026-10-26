// tests/productStats.test.js
//
// Counting what shoppers look at.
//
// The thing worth protecting here is the meaning of the numbers. A shop
// owner is going to reprice a product, rewrite its description or reshoot
// its photographs on the strength of this page, so a rate computed from
// three views would be worse than showing nothing at all.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import ProductStat from "@/models/ProductStat";
import Order from "@/models/Order";
import Settings from "@/models/Settings";

const { recordSignal, productPerformance, needsAttention, MIN_VIEWS_FOR_RATE, SIGNALS } = await import("@/lib/productStats");
const { clearTimezoneCache } = await import("@/lib/storeTime");

let n = 0;
const make = (o = {}) =>
  Product.create({ name: `P${++n}`, slug: `p-${n}-${Date.now()}`, price: 100, category: "C", stock: 5, status: "public", ...o });

const buy = (product, qty = 1, o = {}) =>
  Order.create({
    orderNumber: `ORD-${++n}`,
    guestEmail: `b${n}@example.com`,
    items: [{ product: product._id, name: product.name, quantity: qty, price: product.price }],
    shippingAddress: { fullName: "A", phone: "01700000000", address: "x", city: "Dhaka", country: "Bangladesh" },
    totalAmount: product.price * qty,
    paymentMethod: "cod",
    paymentStatus: o.paymentStatus || "paid",
    orderStatus: o.orderStatus || "delivered",
    createdAt: o.createdAt || new Date(),
  });

const views = async (product, count, when) => {
  for (let i = 0; i < count; i++) await recordSignal(product._id, SIGNALS.VIEW, when ? { now: when } : {});
};

const range = () => ({ from: new Date(Date.now() - 7 * 864e5), to: new Date(Date.now() + 864e5) });

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
  clearTimezoneCache();
});

describe("recording a signal", () => {
  it("counts views and basket adds separately, in one row per day", async () => {
    const p = await make();
    await views(p, 3);
    await recordSignal(p._id, SIGNALS.CART);

    const rows = await ProductStat.find({ product: p._id }).lean();
    expect(rows).toHaveLength(1); // upserted, not duplicated
    expect(rows[0].views).toBe(3);
    expect(rows[0].addToCart).toBe(1);
  });

  it("stores nothing about who was looking", async () => {
    const p = await make();
    await recordSignal(p._id, SIGNALS.VIEW);

    const row = await ProductStat.findOne({ product: p._id }).lean();
    // A counter is all this is meant to be. If a field ever appears here
    // that could identify a shopper, this test is the place it gets caught.
    expect(Object.keys(row).sort()).toEqual(
      ["_id", "__v", "addToCart", "createdAt", "day", "product", "updatedAt", "views"].sort()
    );
  });

  it("refuses an id that isn't a product", async () => {
    expect(await recordSignal("not-an-id", SIGNALS.VIEW)).toBe(false);
    expect(await recordSignal("000000000000000000000001", SIGNALS.VIEW)).toBe(false);
    expect(await ProductStat.countDocuments()).toBe(0);
  });

  it("refuses a product nobody could be looking at", async () => {
    // Otherwise the collection could be grown with rows for drafts by
    // anyone posting ids at the endpoint.
    const draft = await make({ status: "draft" });
    expect(await recordSignal(draft._id, SIGNALS.VIEW)).toBe(false);

    // An unlisted product IS reachable by direct link, so it counts.
    const unlisted = await make({ status: "unlisted" });
    expect(await recordSignal(unlisted._id, SIGNALS.VIEW)).toBe(true);
  });

  it("refuses a signal type it doesn't know", async () => {
    const p = await make();
    expect(await recordSignal(p._id, "purchase")).toBe(false);
    expect(await ProductStat.countDocuments()).toBe(0);
  });

  it("files a late-night view on the shop's date, like every other figure", async () => {
    await Settings.create({ general: { timezone: "Asia/Dhaka" } });
    clearTimezoneCache();
    const p = await make();

    // 02:30 on the 16th in Dhaka.
    await recordSignal(p._id, SIGNALS.VIEW, { now: new Date("2026-10-15T20:30:00Z") });

    expect((await ProductStat.findOne({ product: p._id }).lean()).day).toBe("2026-10-16");
  });
});

describe("the performance report", () => {
  it("puts views, baskets and sales side by side", async () => {
    const p = await make({ name: "Jacket", price: 1000 });
    await views(p, 40);
    for (let i = 0; i < 8; i++) await recordSignal(p._id, SIGNALS.CART);
    await buy(p, 2);

    const { rows } = await productPerformance(range());
    const jacket = rows.find((r) => r.name === "Jacket");

    expect(jacket.views).toBe(40);
    expect(jacket.addToCart).toBe(8);
    expect(jacket.units).toBe(2);
    expect(jacket.cartRate).toBe(20); // 8 of 40
    expect(jacket.buyRate).toBe(5); // 2 of 40
    expect(jacket.revenue).toBe(2000);
  });

  it("takes sales from orders, never from a counter of its own", async () => {
    const p = await make({ price: 500 });
    await views(p, 30);
    await buy(p, 3, { paymentStatus: "pending" }); // unpaid
    await buy(p, 2, { orderStatus: "cancelled" }); // cancelled
    await buy(p, 1); // the only real sale

    const { rows } = await productPerformance(range());
    expect(rows[0].units).toBe(1);
    expect(rows[0].revenue).toBe(500);
  });

  it("says nothing rather than computing a rate from a handful of views", async () => {
    const p = await make();
    await views(p, MIN_VIEWS_FOR_RATE - 1);

    const { rows } = await productPerformance(range());
    // "0% conversion" from nineteen views is noise dressed as a finding.
    expect(rows[0].buyRate).toBeNull();
    expect(rows[0].cartRate).toBeNull();
    expect(rows[0].views).toBe(MIN_VIEWS_FOR_RATE - 1);
  });

  it("starts reporting rates once there is enough to judge", async () => {
    const p = await make();
    await views(p, MIN_VIEWS_FOR_RATE);

    const { rows } = await productPerformance(range());
    expect(rows[0].buyRate).toBe(0);
  });

  it("leaves out days outside the range", async () => {
    const p = await make();
    await views(p, 5, new Date(Date.now() - 60 * 864e5));

    const { rows } = await productPerformance(range());
    expect(rows).toEqual([]);
  });

  it("includes a product that sold without being viewed", async () => {
    // An order placed by staff, or a product whose views predate this
    // feature — it should still appear rather than vanishing.
    const p = await make({ name: "Phone Order" });
    await buy(p, 1);

    const { rows } = await productPerformance(range());
    expect(rows.map((r) => r.name)).toContain("Phone Order");
    expect(rows[0].views).toBe(0);
  });

  it("sorts worst-converting first when asked", async () => {
    const bad = await make({ name: "Bad" });
    const good = await make({ name: "Good" });
    await views(bad, 50);
    await views(good, 50);
    await buy(good, 10);

    const { rows } = await productPerformance({ ...range(), sort: "worst" });
    expect(rows[0].name).toBe("Bad");
  });
});

describe("what to look at first", () => {
  it("lists products with real interest and no sales", async () => {
    const ignored = await make({ name: "Ignored", status: "public" });
    const sells = await make({ name: "Sells" });
    const barelySeen = await make({ name: "Barely Seen" });

    await views(ignored, 40);
    await views(sells, 40);
    await views(barelySeen, 3);
    await buy(sells, 1);

    const { rows } = await productPerformance(range());
    const attention = needsAttention(rows);

    expect(attention.map((r) => r.name)).toEqual(["Ignored"]);
  });

  it("ignores products that aren't on sale", async () => {
    // A draft converting badly is not news.
    const draft = await make({ name: "Draft", status: "draft" });
    await ProductStat.create({ product: draft._id, day: "2026-01-01", views: 100 });

    const { rows } = await productPerformance({ from: new Date("2026-01-01"), to: new Date("2026-01-02") });
    expect(needsAttention(rows)).toEqual([]);
  });
});
