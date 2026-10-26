// tests/savedCart.test.js
//
// A basket that follows its owner between devices.
//
// The merge is the part worth testing hardest, because the failure modes
// are all silent and all cost money: a basket that doubles when you sign
// in twice, a basket that loses the item you added on your phone, or one
// that restores something the shop has since stopped selling.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Cart from "@/models/Cart";
import User from "@/models/User";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const { GET, PUT, DELETE } = await import("@/app/api/cart/saved/route");
const { mergeCartItems, isAbandoned, dueForReminder, countsAsRecovery, cartState, sameCart } = await import("@/lib/savedCart");

const put = (items) =>
  PUT(new Request("http://localhost/api/cart/saved", { method: "PUT", body: JSON.stringify({ items }) })).then((r) => r.json());
const get = () => GET().then((r) => r.json());

let n = 0;
const make = (o = {}) =>
  Product.create({ name: `P${++n}`, slug: `p-${n}-${Date.now()}`, price: 100, category: "C", stock: 5, status: "public", ...o });

let user;

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  user = await User.create({ name: "Shopper", email: `s${++n}@example.com`, password: "x".repeat(20) });
  mockSession = { user: { id: String(user._id), role: "customer" } };
});

describe("merging the basket in this browser with the one on the server", () => {
  const id = (s) => s.padStart(24, "0");

  it("takes the higher quantity rather than adding them up", () => {
    // Summing looks right until the same basket syncs twice: sign in on a
    // laptop that already has two and you'd have four.
    const merged = mergeCartItems(
      [{ product: id("a"), quantity: 2 }],
      [{ product: id("a"), quantity: 2 }]
    );
    expect(merged).toEqual([{ product: id("a"), quantity: 2, combinationKey: "", knownPrice: null }]);
  });

  it("is safe to run twice — the second merge changes nothing", () => {
    const local = [{ product: id("a"), quantity: 1 }];
    const server = [{ product: id("b"), quantity: 3 }];
    const once = mergeCartItems(local, server);
    const twice = mergeCartItems(once, server);
    expect(sameCart(once, twice)).toBe(true);
  });

  it("keeps items that exist on only one side", () => {
    const merged = mergeCartItems([{ product: id("a"), quantity: 1 }], [{ product: id("b"), quantity: 1 }]);
    expect(merged.map((i) => i.product).sort()).toEqual([id("a"), id("b")].sort());
  });

  it("keeps two variants of one product apart", () => {
    const merged = mergeCartItems(
      [{ product: id("a"), combinationKey: "S", quantity: 1 }],
      [{ product: id("a"), combinationKey: "M", quantity: 1 }]
    );
    expect(merged).toHaveLength(2);
  });

  it("throws away anything that isn't a real line", () => {
    const merged = mergeCartItems([{ product: "not-an-id", quantity: 1 }, null, { quantity: 4 }], []);
    expect(merged).toEqual([]);
  });
});

describe("saving a basket", () => {
  it("stores ids and quantities, never prices", async () => {
    const p = await make({ price: 250 });
    await put([{ product: String(p._id), quantity: 2 }]);

    const saved = await Cart.findOne({ user: user._id }).lean();
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].quantity).toBe(2);
    // A stored price goes stale the moment the shop changes one.
    expect(JSON.stringify(saved.items[0])).not.toContain("250");
  });

  it("reads back with today's price, not the one from when it was saved", async () => {
    const p = await make({ price: 250 });
    await put([{ product: String(p._id), quantity: 1 }]);

    await Product.updateOne({ _id: p._id }, { $set: { price: 400 } });
    const res = await get();

    expect(res.data.lines[0].price).toBe(400);
  });

  it("reports a saved item that has sold out instead of hiding it", async () => {
    const p = await make({ stock: 0 });
    await put([{ product: String(p._id), quantity: 1 }]);

    const res = await get();
    expect(res.data.lines[0].quantity).toBe(0);
    expect(res.data.changed).toBe(true);
  });

  it("turns a signed-out request away", async () => {
    mockSession = null;
    expect((await get()).success).toBe(false);
    expect((await put([])).success).toBe(false);
    expect((await DELETE().then((r) => r.json())).success).toBe(false);
  });

  it("never hands one customer another's basket", async () => {
    const p = await make();
    await put([{ product: String(p._id), quantity: 3 }]);

    const other = await User.create({ name: "Other", email: `o${++n}@example.com`, password: "x".repeat(20) });
    mockSession = { user: { id: String(other._id), role: "customer" } };

    // No id is taken from the request at all — the session is the only
    // thing that decides whose basket this is.
    expect((await get()).data.items).toEqual([]);
  });

  it("starts the reminder history over when an empty basket is filled again", async () => {
    const p = await make();
    await Cart.create({ user: user._id, items: [], reminderSentAt: new Date(), reminderCount: 1 });

    await put([{ product: String(p._id), quantity: 1 }]);

    const saved = await Cart.findOne({ user: user._id }).lean();
    // Otherwise one reminder months ago would retire this customer from
    // ever being reminded again.
    expect(saved.reminderCount).toBe(0);
    expect(saved.reminderSentAt).toBeNull();
  });

  it("does not reset the history while the same basket is being edited", async () => {
    const p = await make();
    await put([{ product: String(p._id), quantity: 1 }]);
    await Cart.updateOne({ user: user._id }, { $set: { reminderSentAt: new Date(), reminderCount: 1 } });

    await put([{ product: String(p._id), quantity: 2 }]);

    expect((await Cart.findOne({ user: user._id }).lean()).reminderCount).toBe(1);
  });
});

describe("when a basket counts as abandoned", () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);
  const cart = (o = {}) => ({ items: [{ product: "x", quantity: 1 }], lastActivityAt: hoursAgo(10), ...o });

  it("is not abandoned while the shopper is still in it", () => {
    expect(isAbandoned(cart({ lastActivityAt: hoursAgo(1) }))).toBe(false);
  });

  it("is abandoned once it has sat still", () => {
    expect(isAbandoned(cart())).toBe(true);
  });

  it("an empty basket is never abandoned — there is nothing to come back to", () => {
    expect(isAbandoned(cart({ items: [] }))).toBe(false);
  });

  it("a bought basket is never abandoned — ordering empties it", () => {
    expect(isAbandoned(cart({ items: [] }))).toBe(false);
  });
});

describe("when a reminder is due", () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);
  const cart = (o = {}) => ({ items: [{ product: "x", quantity: 1 }], lastActivityAt: hoursAgo(10), reminderCount: 0, ...o });

  it("is due for a basket left alone and never reminded", () => {
    expect(dueForReminder(cart())).toBe(true);
  });

  it("is never due twice for the same basket", () => {
    expect(dueForReminder(cart({ reminderCount: 1, reminderSentAt: hoursAgo(5) }))).toBe(false);
  });

  it("is not due again just because the shopper looked and left", () => {
    // Reminded an hour ago, basket touched two hours ago: sending now would
    // be a second reminder about the same basket.
    expect(dueForReminder(cart({ lastActivityAt: hoursAgo(2), reminderSentAt: hoursAgo(1) }))).toBe(false);
  });
});

describe("crediting a reminder with an order", () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);

  it("credits an order placed soon after the reminder", () => {
    expect(countsAsRecovery({ reminderSentAt: hoursAgo(5) })).toBe(true);
  });

  it("does not credit a basket that was never reminded", () => {
    // A shop that counts orders it would have had anyway cannot tell
    // whether reminders are worth sending.
    expect(countsAsRecovery({ reminderSentAt: null })).toBe(false);
  });

  it("does not credit an order weeks later", () => {
    expect(countsAsRecovery({ reminderSentAt: hoursAgo(24 * 14) })).toBe(false);
  });

  it("names the state the admin list shows", () => {
    expect(cartState({ items: [{}], lastActivityAt: hoursAgo(1) })).toBe("active");
    expect(cartState({ items: [{}], lastActivityAt: hoursAgo(9) })).toBe("abandoned");
    expect(cartState({ items: [{}], lastActivityAt: hoursAgo(9), reminderSentAt: hoursAgo(2) })).toBe("reminded");
    // "recovered" is not a state a live basket is ever in — it is history,
    // kept in its own record.
    expect(cartState({ items: [] })).toBe("empty");
  });
});
