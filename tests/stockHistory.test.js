// tests/stockHistory.test.js
//
// Why a stock number is what it is.
//
// Six different parts of the system change stock, and the thing worth
// protecting is that every one of them leaves a row that explains itself.
// A ledger with gaps is worse than no ledger: it looks authoritative while
// quietly omitting the change somebody is actually looking for.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Guest checkout is used below, so no session is needed — but the route
// still loads NextAuth, and the email layer must not try to send anything.
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mockSession) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import StockMovement, { STOCK_REASONS } from "@/models/StockMovement";

const { adjustStock, atomicDecrement, setStock, recordMovement } = await import("@/lib/productStock");
const { GET } = await import("@/app/api/admin/stock/route");

let n = 0;
const make = (o = {}) =>
  Product.create({
    name: `P${++n}`,
    slug: `p-${n}-${Date.now()}`,
    price: 100,
    category: "C",
    stock: 10,
    status: "public",
    ...o,
  });

const history = (product) => StockMovement.find({ product: product._id }).sort({ at: 1 }).lean();

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

describe("recording a change", () => {
  it("records what happened and what the number was left at", async () => {
    const p = await make({ stock: 10 });

    await adjustStock([{ product: p._id, quantity: 3 }], -1, null, { reason: STOCK_REASONS.SALE });

    const [row] = await history(p);
    expect(row.delta).toBe(-3);
    expect(row.reason).toBe(STOCK_REASONS.SALE);
    // Read back from the product rather than assumed, so a number that
    // drifted is visible instead of being papered over.
    expect(row.balanceAfter).toBe(7);
    expect((await Product.findById(p._id).lean()).stock).toBe(7);
  });

  it("keeps a variant's history to itself", async () => {
    const p = await make({
      stock: 0,
      options: [{ name: "Size", values: ["S", "M"] }],
      combinations: [
        { key: "S", stock: 5, active: true },
        { key: "M", stock: 5, active: true },
      ],
    });

    await adjustStock([{ product: p._id, combinationKey: "S", quantity: 2 }], -1, null, { reason: STOCK_REASONS.SALE });

    const rows = await history(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].combinationKey).toBe("S");
    expect(rows[0].balanceAfter).toBe(3); // the variant's count, not the product's
  });

  it("records nothing for a decrement that was refused", async () => {
    const p = await make({ stock: 1 });

    const ok = await atomicDecrement(p._id, "", 5, null, { reason: STOCK_REASONS.SALE });

    // Nothing moved, so nothing happened — a row here would be a sale that
    // never was.
    expect(ok).toBe(false);
    expect(await history(p)).toEqual([]);
    expect((await Product.findById(p._id).lean()).stock).toBe(1);
  });

  it("still moves stock when the caller gives no reason", async () => {
    const p = await make({ stock: 10 });

    await adjustStock([{ product: p._id, quantity: 2 }], -1);

    // Breaking an order because history couldn't be written would be the
    // wrong trade. The stock moves; the row is skipped rather than guessed.
    expect((await Product.findById(p._id).lean()).stock).toBe(8);
    expect(await history(p)).toEqual([]);
  });

  it("never lets a failed write break the stock change", async () => {
    const p = await make({ stock: 10 });
    // A reason the schema doesn't allow makes the insert throw.
    await expect(recordMovement({ product: p._id, delta: -1, reason: "not-a-real-reason" })).resolves.toBeUndefined();
  });
});

describe("a number changed by a person", () => {
  it("records the difference, not the new value", async () => {
    const p = await make({ stock: 10 });

    const delta = await setStock({ productId: p._id, to: 40, by: { id: null, name: "Sumon" } });

    expect(delta).toBe(30);
    const [row] = await history(p);
    expect(row.delta).toBe(30);
    expect(row.reason).toBe(STOCK_REASONS.MANUAL);
    expect(row.by.name).toBe("Sumon");
    expect(row.balanceAfter).toBe(40);
  });

  it("records a reduction too", async () => {
    const p = await make({ stock: 10 });
    await setStock({ productId: p._id, to: 2 });
    expect((await history(p))[0].delta).toBe(-8);
  });

  it("writes nothing when the number didn't change", async () => {
    const p = await make({ stock: 10 });
    // Saving a product form without touching stock is not a movement, and
    // a history full of "changed 10 to 10" is a history nobody reads.
    expect(await setStock({ productId: p._id, to: 10 })).toBe(0);
    expect(await history(p)).toEqual([]);
  });

  it("sets a variant's count without touching the others", async () => {
    const p = await make({
      stock: 0,
      combinations: [
        { key: "S", stock: 5, active: true },
        { key: "M", stock: 5, active: true },
      ],
    });

    await setStock({ productId: p._id, combinationKey: "M", to: 12 });

    const after = await Product.findById(p._id).lean();
    expect(after.combinations.find((c) => c.key === "S").stock).toBe(5);
    expect(after.combinations.find((c) => c.key === "M").stock).toBe(12);
    expect((await history(p))[0].delta).toBe(7);
  });

  it("ignores a value that isn't a number", async () => {
    const p = await make({ stock: 10 });
    expect(await setStock({ productId: p._id, to: "lots" })).toBe(0);
    expect((await Product.findById(p._id).lean()).stock).toBe(10);
  });
});

describe("the story a product's history tells", () => {
  it("follows a unit out and back again", async () => {
    const p = await make({ stock: 10 });

    await recordMovement({ product: p._id, delta: 10, reason: STOCK_REASONS.CREATED });
    await adjustStock([{ product: p._id, quantity: 4 }], -1, null, { reason: STOCK_REASONS.SALE });
    await adjustStock([{ product: p._id, quantity: 1 }], 1, null, { reason: STOCK_REASONS.RETURNED });
    await adjustStock([{ product: p._id, quantity: 2 }], 1, null, { reason: STOCK_REASONS.CANCELLED });

    const rows = await history(p);
    expect(rows.map((r) => r.reason)).toEqual([
      STOCK_REASONS.CREATED,
      STOCK_REASONS.SALE,
      STOCK_REASONS.RETURNED,
      STOCK_REASONS.CANCELLED,
    ]);
    expect(rows.map((r) => r.delta)).toEqual([10, -4, 1, 2]);

    // And the sum of the ledger is the number on the product.
    const total = rows.reduce((s, r) => s + r.delta, 0);
    expect(total).toBe((await Product.findById(p._id).lean()).stock);
  });

  it("shows a gap when stock moved outside the system", async () => {
    const p = await make({ stock: 10 });
    await recordMovement({ product: p._id, delta: 10, reason: STOCK_REASONS.CREATED });

    // Somebody edits the database directly, or a backup is restored.
    await Product.updateOne({ _id: p._id }, { $set: { stock: 3 } });

    const rows = await history(p);
    const ledger = rows.reduce((s, r) => s + r.delta, 0);
    const actual = (await Product.findById(p._id).lean()).stock;

    // This is exactly the discrepancy the admin page reports rather than
    // silently correcting — correcting it would destroy the evidence.
    expect(ledger).toBe(10);
    expect(actual).toBe(3);
    expect(ledger).not.toBe(actual);
  });
});

// ---- through the real routes --------------------------------------------
//
// The unit tests above prove the ledger writes correctly. These prove the
// six paths that actually move stock in production are wired to it — which
// is the part that silently rots when a seventh is added.
describe("the paths that really move stock", () => {
  it("records a sale when an order is placed, and the return when it's cancelled", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const { PUT } = await import("@/app/api/orders/[id]/route");

    // Guest checkout is off by default, and this test is about stock
    // rather than sessions.
    const Settings = (await import("@/models/Settings")).default;
    await Settings.create({ checkout: { guestCheckout: "all" } });

    const p = await make({ stock: 10, price: 100 });

    const placed = await POST(
      new Request("http://shop.test/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.1.1.9" },
        body: JSON.stringify({
          items: [{ product: String(p._id), quantity: 2 }],
          paymentMethod: "cod",
          guestEmail: "shopper@example.com",
          shippingAddress: {
            fullName: "Shopper",
            phone: "01700000000",
            address: "1 Road",
            city: "Dhaka",
            country: "Bangladesh",
          },
        }),
      })
    ).then((r) => r.json());

    expect(placed.success).toBe(true);

    const sold = await history(p);
    expect(sold).toHaveLength(1);
    expect(sold[0].reason).toBe(STOCK_REASONS.SALE);
    expect(sold[0].delta).toBe(-2);
    expect(sold[0].balanceAfter).toBe(8);
    // tied to the order that caused it, so the row can be followed back
    expect(String(sold[0].order)).toBe(String(placed.data._id));

    // Staff cancelling the order — the path that gives the stock back.
    mockSession = { user: { id: "000000000000000000000001", role: "admin", name: "Admin" } };

    await PUT(
      new Request(`http://shop.test/api/orders/${placed.data._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.1.1.9" },
        body: JSON.stringify({ orderStatus: "cancelled" }),
      }),
      { params: { id: String(placed.data._id) } }
    );

    const rows = await history(p);
    expect(rows.map((r) => r.reason)).toEqual([STOCK_REASONS.SALE, STOCK_REASONS.CANCELLED]);
    expect(rows.map((r) => r.delta)).toEqual([-2, 2]);
    // and the ledger closes back to where it started
    expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(0);
    expect((await Product.findById(p._id).lean()).stock).toBe(10);
  });
});

describe("telling an incomplete history from a real gap", () => {
  // Both look like "the numbers don't match". One is a product that
  // predates the ledger; the other is stock that moved without being
  // recorded. Reporting them the same way teaches an owner to ignore the
  // one that matters.
  const check = async (product) => {
    const res = await GET(new Request(`http://shop.test/api/admin/stock?product=${product._id}`)).then((r) => r.json());
    return res.data.integrity;
  };

  it("says the history is incomplete when there's no opening entry", async () => {
    mockSession = { user: { id: "000000000000000000000001", role: "admin", name: "Admin" } };
    const p = await make({ stock: 10 });
    await adjustStock([{ product: p._id, quantity: 1 }], -1, null, { reason: STOCK_REASONS.SALE });

    const integrity = await check(p);
    expect(integrity.state).toBe("incomplete");
    expect(integrity.agrees).toBe(false);
    expect(integrity.note).toMatch(/before stock history was switched on/i);
  });

  it("calls it a mismatch when the history is complete and still doesn't add up", async () => {
    mockSession = { user: { id: "000000000000000000000001", role: "admin", name: "Admin" } };
    const p = await make({ stock: 10 });
    await recordMovement({ product: p._id, delta: 10, reason: STOCK_REASONS.CREATED });

    // Somebody edits the database directly.
    await Product.updateOne({ _id: p._id }, { $set: { stock: 3 } });

    const integrity = await check(p);
    expect(integrity.state).toBe("mismatch");
    expect(integrity.lines[0]).toMatchObject({ actual: 3, ledger: 10, agrees: false });
  });

  it("says it adds up when it does", async () => {
    mockSession = { user: { id: "000000000000000000000001", role: "admin", name: "Admin" } };
    const p = await make({ stock: 10 });
    await recordMovement({ product: p._id, delta: 10, reason: STOCK_REASONS.CREATED });
    await adjustStock([{ product: p._id, quantity: 4 }], -1, null, { reason: STOCK_REASONS.SALE });

    const integrity = await check(p);
    expect(integrity.state).toBe("ok");
    expect(integrity.agrees).toBe(true);
  });

  it("refuses a caller without permission", async () => {
    mockSession = { user: { id: "000000000000000000000002", role: "customer" } };
    const res = await GET(new Request("http://shop.test/api/admin/stock"));
    expect(res.status).toBe(403);
  });
});
