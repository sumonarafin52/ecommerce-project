// tests/cartRevalidation.test.js
//
// A cart lives in the browser and can be days old. These cover what the
// shopper is told when the shop has moved on without them.
//
// The failure this replaces: the cart kept whatever price it was stored
// with, so a shopper could reach checkout looking at ৳810 for goods that now
// cost ৳1,410 with one of them sold out — and only discover it after
// pressing Place Order, or, on cash on delivery, when the rider asked for a
// different amount at the door.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";

const cartRoute = await import("@/app/api/cart/route");
const { revalidateCart, normaliseCartInput, describeIssue, CART_ISSUES } = await import("@/lib/cartRevalidation");

const post = (items) =>
  cartRoute.POST(
    new Request("http://x/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
  );

const issuesOf = (line) => line.issues.map((i) => i.type);

let mug;

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  mug = await Product.create({
    name: "Ceramic Mug",
    slug: "ceramic-mug",
    category: "Home",
    price: 450,
    stock: 20,
    status: "public",
    images: ["https://example.com/mug.jpg"],
  });
});

describe("a cart that is still correct", () => {
  it("reports nothing to tell the shopper", async () => {
    const { data } = await (await post([{ product: String(mug._id), quantity: 2, price: 450 }])).json();
    expect(data.changed).toBe(false);
    expect(data.items[0].issues).toEqual([]);
    expect(data.items[0].quantity).toBe(2);
    expect(data.totalAmount).toBe(900);
  });

  it("says nothing about a price it was never shown", async () => {
    // No `price` sent (an old cart entry, or a fresh add) — there is no
    // "was" to compare against, so claiming it changed would be a guess.
    const { data } = await (await post([{ product: String(mug._id), quantity: 1 }])).json();
    expect(data.items[0].issues).toEqual([]);
  });
});

describe("the price moved", () => {
  it("reports the rise and charges the new price", async () => {
    await Product.updateOne({ _id: mug._id }, { price: 900 });
    const { data } = await (await post([{ product: String(mug._id), quantity: 1, price: 450 }])).json();

    expect(issuesOf(data.items[0])).toEqual([CART_ISSUES.PRICE_CHANGED]);
    expect(data.items[0].issues[0]).toMatchObject({ was: 450, now: 900 });
    expect(data.totalAmount).toBe(900);
  });

  it("reports a drop too, rather than quietly overcharging", async () => {
    await Product.updateOne({ _id: mug._id }, { discountPrice: 300 });
    const { data } = await (await post([{ product: String(mug._id), quantity: 1, price: 450 }])).json();
    expect(data.items[0].price).toBe(300);
    expect(describeIssue(data.items[0].issues[0], (n) => `৳${n}`)).toMatch(/dropped/i);
  });

  it("ignores a rounding difference", async () => {
    await Product.updateOne({ _id: mug._id }, { price: 450.2 });
    const { data } = await (await post([{ product: String(mug._id), quantity: 1, price: 450 }])).json();
    expect(data.items[0].issues).toEqual([]);
  });
});

describe("stock ran short", () => {
  it("cuts the quantity to what is left and says so", async () => {
    await Product.updateOne({ _id: mug._id }, { stock: 2 });
    const { data } = await (await post([{ product: String(mug._id), quantity: 5, price: 450 }])).json();

    expect(data.items[0].quantity).toBe(2);
    expect(data.items[0].issues[0]).toMatchObject({ type: CART_ISSUES.STOCK_REDUCED, was: 5, now: 2 });
    expect(data.totalAmount).toBe(900);
  });

  it("zeroes a sold-out line but keeps it visible", async () => {
    await Product.updateOne({ _id: mug._id }, { stock: 0 });
    const { data } = await (await post([{ product: String(mug._id), quantity: 1, price: 450 }])).json();

    expect(issuesOf(data.items[0])).toContain(CART_ISSUES.OUT_OF_STOCK);
    expect(data.items[0].quantity).toBe(0);
    // still named, so the page can say WHICH item went rather than it
    // disappearing without explanation
    expect(data.items[0].name).toBe("Ceramic Mug");
    expect(data.totalAmount).toBe(0);
  });
});

describe("the product went away", () => {
  it("reports an unpublished product as unavailable", async () => {
    await Product.updateOne({ _id: mug._id }, { status: "draft" });
    const { data } = await (await post([{ product: String(mug._id), quantity: 1, price: 450 }])).json();
    expect(issuesOf(data.items[0])).toEqual([CART_ISSUES.UNAVAILABLE]);
    expect(data.items[0].quantity).toBe(0);
  });

  it("treats an unlisted product the same — a stale cart should not keep selling it", async () => {
    await Product.updateOne({ _id: mug._id }, { status: "unlisted" });
    const { data } = await (await post([{ product: String(mug._id), quantity: 1 }])).json();
    expect(issuesOf(data.items[0])).toEqual([CART_ISSUES.UNAVAILABLE]);
  });

  it("handles a product that was deleted outright", async () => {
    const goneId = String(new mongoose.Types.ObjectId());
    const { data } = await (await post([{ product: goneId, quantity: 1, price: 100 }])).json();
    expect(issuesOf(data.items[0])).toEqual([CART_ISSUES.UNAVAILABLE]);
  });
});

describe("variants", () => {
  let shirt;
  beforeEach(async () => {
    shirt = await Product.create({
      name: "T-Shirt",
      slug: "t-shirt",
      category: "Fashion",
      price: 500,
      stock: 0,
      status: "public",
      options: [{ name: "Size", values: ["S", "M"] }],
      combinations: [
        { key: "S", options: { Size: "S" }, price: 550, stock: 3, active: true },
        { key: "M", options: { Size: "M" }, price: 0, stock: 1, active: true },
      ],
    });
  });

  it("uses the variant's own price and stock, not the product's", async () => {
    const { data } = await (await post([{ product: String(shirt._id), combinationKey: "S", quantity: 2, price: 550 }])).json();
    expect(data.items[0].price).toBe(550);
    expect(data.items[0].stock).toBe(3);
    expect(data.items[0].issues).toEqual([]);
  });

  it("falls back to the base price when the variant has none", async () => {
    // A combination price of 0 means "use the product's price" — the same
    // rule the storefront and the order route follow.
    const { data } = await (await post([{ product: String(shirt._id), combinationKey: "M", quantity: 1, price: 500 }])).json();
    expect(data.items[0].price).toBe(500);
  });

  it("reports a retired variant separately from the product being gone", async () => {
    // The shopper may well want a different size, so "the option you chose
    // is no longer sold" is a different message from "this item is gone".
    await Product.updateOne({ _id: shirt._id }, { $set: { "combinations.0.active": false } });
    const { data } = await (await post([{ product: String(shirt._id), combinationKey: "S", quantity: 1, price: 550 }])).json();
    expect(issuesOf(data.items[0])).toEqual([CART_ISSUES.VARIANT_GONE]);
    expect(describeIssue(data.items[0].issues[0])).toMatch(/option you chose/i);
  });

  it("keeps two sizes of one product as separate lines", async () => {
    const { data } = await (
      await post([
        { product: String(shirt._id), combinationKey: "S", quantity: 1, price: 550 },
        { product: String(shirt._id), combinationKey: "M", quantity: 1, price: 500 },
      ])
    ).json();
    expect(data.items).toHaveLength(2);
    expect(data.items.map((i) => i.combinationKey)).toEqual(["S", "M"]);
    expect(data.totalAmount).toBe(1050);
  });
});

describe("one bad item does not spoil the cart", () => {
  it("keeps the good lines and flags only the broken one", async () => {
    // The old endpoint failed the whole request on the first problem, so a
    // shopper with four good items and one sold-out one got nothing back.
    const gone = await Product.create({ name: "Gone", slug: "gone", category: "Home", price: 100, stock: 0, status: "public" });
    const { data } = await (
      await post([
        { product: String(mug._id), quantity: 1, price: 450 },
        { product: String(gone._id), quantity: 1, price: 100 },
      ])
    ).json();

    expect(data.items).toHaveLength(2);
    expect(data.items[0].issues).toEqual([]);
    expect(issuesOf(data.items[1])).toContain(CART_ISSUES.OUT_OF_STOCK);
    // the good item is still payable
    expect(data.totalAmount).toBe(450);
  });
});

describe("what the browser sends is not trusted", () => {
  it("never lets a tampered price change what anything costs", async () => {
    // `price` is accepted only so the answer can say "was X, now Y".
    const { data } = await (await post([{ product: String(mug._id), quantity: 1, price: 1 }])).json();
    expect(data.items[0].price).toBe(450);
    expect(data.totalAmount).toBe(450);
  });

  it("throws out junk ids and silly quantities instead of erroring", async () => {
    const lines = normaliseCartInput([
      { product: "not-an-id", quantity: 1 },
      { product: String(mug._id), quantity: -5 },
      { product: String(mug._id), quantity: 999999 },
      null,
      "nonsense",
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.quantity >= 1)).toBe(true);
  });

  it("answers an empty or malformed cart with an empty result, not a 500", async () => {
    for (const body of [[], null, "x", [{}]]) {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect((await res.json()).data.items).toEqual([]);
    }
  });

  it("caps an absurdly long cart", async () => {
    const huge = Array.from({ length: 500 }, () => ({ product: String(mug._id), quantity: 1 }));
    expect(normaliseCartInput(huge)).toHaveLength(100);
  });
});

describe("revalidateCart on its own", () => {
  it("returns nothing for an empty cart without touching the database", async () => {
    expect(await revalidateCart([])).toEqual({ items: [], totalAmount: 0, changed: false });
  });

  it("marks the cart as changed only when something actually did", async () => {
    const same = await revalidateCart([{ product: String(mug._id), quantity: 1, price: 450 }]);
    expect(same.changed).toBe(false);

    await Product.updateOne({ _id: mug._id }, { stock: 0 });
    const now = await revalidateCart([{ product: String(mug._id), quantity: 1, price: 450 }]);
    expect(now.changed).toBe(true);
  });
});

describe("applying the correction to the stored cart", () => {
  // The cart persists to localStorage, which Node has none of. A stub keeps
  // zustand from warning on every write; the store itself works either way,
  // which is also what a shopper in a private window gets.
  beforeAll(() => {
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  });

  // The cart store is what the pages actually render from, so a correct
  // server answer still shows the old number if this step gets it wrong.
  const freshStore = async () => {
    const mod = await import("@/store/cartStore");
    const store = mod.default;
    store.setState({ items: [] });
    return store;
  };

  it("replaces the price, and clears a stale discount that would still win", async () => {
    // getEffectivePrice prefers discountPrice. A product whose discount has
    // ended comes back at full price, but leaving the old discountPrice on
    // the line would keep the cheaper number on screen and in the total.
    const store = await freshStore();
    store.setState({ items: [{ _id: "a".repeat(24), name: "Mug", price: 500, discountPrice: 450, quantity: 1 }] });

    store.getState().applyRevalidation([{ product: "a".repeat(24), combinationKey: "", name: "Mug", price: 900, quantity: 1, stock: 5 }]);

    const [item] = store.getState().items;
    expect(item.price).toBe(900);
    expect(item.discountPrice).toBe(0);
    expect(store.getState().getTotalPrice()).toBe(900);
  });

  it("drops a line the shop can no longer fulfil", async () => {
    const store = await freshStore();
    const keep = "a".repeat(24);
    const gone = "b".repeat(24);
    store.setState({
      items: [
        { _id: keep, name: "Mug", price: 450, quantity: 1 },
        { _id: gone, name: "Sold out", price: 300, quantity: 1 },
      ],
    });

    store.getState().applyRevalidation([
      { product: keep, combinationKey: "", name: "Mug", price: 450, quantity: 1, stock: 5 },
      { product: gone, combinationKey: "", name: "Sold out", price: 0, quantity: 0, stock: 0 },
    ]);

    expect(store.getState().items.map((i) => i._id)).toEqual([keep]);
  });

  it("corrects each variant line separately", async () => {
    const store = await freshStore();
    const id = "a".repeat(24);
    store.setState({
      items: [
        { _id: id, name: "Shirt (S)", price: 550, quantity: 2, combinationKey: "S" },
        { _id: id, name: "Shirt (M)", price: 500, quantity: 1, combinationKey: "M" },
      ],
    });

    store.getState().applyRevalidation([
      { product: id, combinationKey: "S", name: "Shirt (S)", price: 550, quantity: 1, stock: 1 },
      { product: id, combinationKey: "M", name: "Shirt (M)", price: 600, quantity: 1, stock: 4 },
    ]);

    const items = store.getState().items;
    expect(items.find((i) => i.combinationKey === "S").quantity).toBe(1);
    expect(items.find((i) => i.combinationKey === "M").price).toBe(600);
  });

  it("leaves alone a line the server said nothing about", async () => {
    // A partial answer must not silently empty someone's cart.
    const store = await freshStore();
    store.setState({ items: [{ _id: "c".repeat(24), name: "Mug", price: 450, quantity: 2 }] });
    store.getState().applyRevalidation([]);
    expect(store.getState().items).toHaveLength(1);
    expect(store.getState().items[0].quantity).toBe(2);
  });
});
