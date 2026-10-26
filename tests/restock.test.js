// tests/restock.test.js
//
// What to reorder, and how urgently.
//
// The number that matters here is "runs out in N days", and a shop owner
// is going to spend money on it. So the tests are mostly about when NOT to
// produce one: a product with two sales in a month has no rate worth
// quoting, and a confident-looking figure derived from it would be worse
// than a blank.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import User from "@/models/User";
import { STOCK_REASONS } from "@/lib/stockReasons";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mockSession) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

const { restockList, salesVelocity, MIN_UNITS_FOR_VELOCITY } = await import("@/lib/restock");
const { stockAlertRecipients, checkLowStock } = await import("@/lib/inventoryEvents");
const { GET } = await import("@/app/api/admin/restock/route");

let n = 0;
const make = (o = {}) =>
  Product.create({
    name: `P${++n}`,
    slug: `p-${n}-${Date.now()}`,
    price: 100,
    category: "C",
    stock: 10,
    lowStockThreshold: 5,
    status: "public",
    ...o,
  });

const daysAgo = (d) => new Date(Date.now() - d * 864e5);

/** Records `units` sold, spread one per day going back from `startDaysAgo`. */
const sell = async (product, units, { key = "", startDaysAgo = 0 } = {}) => {
  for (let i = 0; i < units; i++) {
    await StockMovement.create({
      product: product._id,
      combinationKey: key,
      delta: -1,
      reason: STOCK_REASONS.SALE,
      at: daysAgo(startDaysAgo + i),
    });
  }
};

const lineFor = (rows, product, key = "") =>
  rows.find((r) => r._id === String(product._id) && r.combinationKey === key);

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
  mockSession = null;
});

describe("how fast something sells", () => {
  it("measures a rate from the ledger's own sale rows", async () => {
    const p = await make({ stock: 20 });
    await sell(p, 10, { startDaysAgo: 0 }); // 10 units across 10 days

    const velocity = await salesVelocity();
    const v = velocity.get(`${p._id}::`);

    expect(v.units).toBe(10);
    expect(v.perDay).toBeCloseTo(1, 1);
  });

  it("averages over the time the product has been selling, not the whole window", async () => {
    // A product that only started selling three days ago sells fast; it
    // should not look slow because the window is thirty days long.
    const p = await make({ stock: 20 });
    await sell(p, 6, { startDaysAgo: 0 }); // 6 units over the last 6 days

    const v = (await salesVelocity()).get(`${p._id}::`);
    expect(v.perDay).toBeCloseTo(1, 1);
  });

  it("ignores sales older than the window", async () => {
    const p = await make({ stock: 20 });
    await sell(p, 5, { startDaysAgo: 60 });

    expect((await salesVelocity({ days: 30 })).get(`${p._id}::`)).toBeUndefined();
  });

  it("counts a variant's sales as its own", async () => {
    const p = await make({
      stock: 0,
      combinations: [
        { key: "S", stock: 10, active: true },
        { key: "M", stock: 10, active: true },
      ],
    });
    await sell(p, 6, { key: "S" });

    const velocity = await salesVelocity();
    expect(velocity.get(`${p._id}::S`).units).toBe(6);
    expect(velocity.get(`${p._id}::M`)).toBeUndefined();
  });
});

describe("saying nothing rather than guessing", () => {
  it("quotes no rate from a couple of sales", async () => {
    const p = await make({ stock: 2 });
    await sell(p, MIN_UNITS_FOR_VELOCITY - 1);

    const { rows } = await restockList();
    const line = lineFor(rows, p);

    // It still appears — two left is below the threshold — but with no
    // invented rate or reorder quantity attached.
    expect(line).toBeTruthy();
    expect(line.perDay).toBeNull();
    expect(line.coverDays).toBeNull();
    expect(line.suggest).toBeNull();
  });

  it("starts quoting one once there's enough", async () => {
    const p = await make({ stock: 10 });
    await sell(p, MIN_UNITS_FOR_VELOCITY);

    const line = lineFor((await restockList()).rows, p);
    expect(line.perDay).not.toBeNull();
  });

  it("treats a product with stock and no sales as unknown, not as infinite cover", async () => {
    const p = await make({ stock: 3 }); // below threshold, never sold

    const line = lineFor((await restockList()).rows, p);
    expect(line.low).toBe(true);
    expect(line.coverDays).toBeNull();
  });
});

describe("the list itself", () => {
  it("puts what's already out of stock first", async () => {
    const healthy = await make({ name: "Healthy", stock: 100 });
    const slow = await make({ name: "Slow", stock: 4 });
    const empty = await make({ name: "Empty", stock: 0 });
    await sell(healthy, 5);
    await sell(slow, 5);
    await sell(empty, 5);

    const { rows } = await restockList();
    expect(rows[0].name).toBe("Empty");
    // A product selling out now is losing sales now; one with days left
    // is losing them later.
    expect(rows.map((r) => r.name)).not.toContain("Healthy");
  });

  it("suggests enough to put the target days back on the shelf", async () => {
    const p = await make({ stock: 5 });
    await sell(p, 10); // about 1/day

    const line = lineFor((await restockList({ targetDays: 30 })).rows, p);
    // ~30 days of cover wanted, 5 already there → order about 25.
    expect(line.suggest).toBeGreaterThan(20);
    expect(line.suggest).toBeLessThan(31);
  });

  it("never suggests a negative order", async () => {
    const p = await make({ stock: 500 });
    await sell(p, 5);
    const line = lineFor((await restockList()).rows, p);
    // Plenty in stock: either it's off the list entirely, or the
    // suggestion is zero — never "order minus four hundred".
    if (line) expect(line.suggest).toBeGreaterThanOrEqual(0);
  });

  it("leaves out products a shopper can't buy anyway", async () => {
    const draft = await make({ name: "Draft", stock: 0, status: "draft" });
    const live = await make({ name: "Live", stock: 0 });

    const names = (await restockList()).rows.map((r) => r.name);
    expect(names).toContain("Live");
    expect(names).not.toContain("Draft"); // a draft running low is nobody's emergency
  });

  it("lists each variant separately", async () => {
    const p = await make({
      stock: 0,
      combinations: [
        { key: "S", stock: 0, active: true },
        { key: "M", stock: 50, active: true },
      ],
    });
    await sell(p, 5, { key: "S" });

    const { rows } = await restockList();
    expect(lineFor(rows, p, "S")).toBeTruthy();
    // The healthy variant isn't a problem and isn't listed.
    expect(lineFor(rows, p, "M")).toBeFalsy();
  });

  it("refuses a caller without permission", async () => {
    mockSession = { user: { id: "000000000000000000000002", role: "customer" } };
    const res = await GET(new Request("http://shop.test/api/admin/restock"));
    expect(res.status).toBe(403);
  });
});

describe("who hears that stock is running out", () => {
  const staff = (role, name) =>
    User.create({ name, email: `${name}${++n}@example.com`.toLowerCase(), password: "x".repeat(20), role });

  it("tells everyone who looks after products, not just the owner", async () => {
    const admin = await staff("admin", "Admin");
    const editor = await staff("editor", "Editor"); // has "products" by default
    const support = await staff("support", "Support"); // does not
    await staff("customer", "Shopper");

    const ids = (await stockAlertRecipients()).map(String);

    expect(ids).toContain(String(admin._id));
    expect(ids).toContain(String(editor._id));
    // Alerting the one person who can't act on it, and nobody who can,
    // is how this behaved before.
    expect(ids).not.toContain(String(support._id));
  });

  it("sends one message when several lines cross at once", async () => {
    const admin = await staff("admin", "Owner");
    const Notification = (await import("@/models/Notification")).default;
    const Settings = (await import("@/models/Settings")).default;
    await Settings.create({});

    const a = await make({ name: "Alpha", stock: 0 });
    const b = await make({ name: "Beta", stock: 0 });

    await checkLowStock([
      { product: a._id, quantity: 5 },
      { product: b._id, quantity: 5 },
    ]);

    const notes = await Notification.find({ user: admin._id }).lean();
    // One digest, not one per product — six lines emptying in a busy hour
    // used to mean six notifications each to every admin.
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/2 products sold out/);
    expect(notes[0].message).toContain("Alpha");
    expect(notes[0].message).toContain("Beta");
    expect(notes[0].link).toBe("/admin/products/restock");
  });

  it("still links straight to the product when only one crossed", async () => {
    const admin = await staff("admin", "Owner");
    const Notification = (await import("@/models/Notification")).default;
    const Settings = (await import("@/models/Settings")).default;
    await Settings.create({});

    const only = await make({ name: "Only", stock: 0 });
    await checkLowStock([{ product: only._id, quantity: 3 }]);

    const [note] = await Notification.find({ user: admin._id }).lean();
    expect(note.link).toBe(`/admin/products/${only._id}/edit`);
  });
});

describe("what an empty shelf is called", () => {
  it("reports no days of cover for a product already at zero", async () => {
    const p = await make({ stock: 0 });
    await sell(p, 10);

    const line = lineFor((await restockList()).rows, p);
    // The page prints "already out" for this rather than "under a day",
    // which would imply there was still something left to sell.
    expect(line.outOfStock).toBe(true);
    expect(line.coverDays).toBe(0);
    expect(line.suggest).toBeGreaterThan(0);
  });
});
