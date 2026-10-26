// tests/recommendations.test.js
//
// What to show a shopper next.
//
// Two things make a recommendation worth having and are easy to get wrong:
// it has to come from real purchases (not from baskets nobody paid for,
// which anyone could manufacture), and it must never surface a product the
// shop isn't selling. The rest of this file is about the fallback chain —
// the reason a shop with three products no longer shows an empty shelf.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";

const { boughtTogether, relatedProducts, recommendedFor, popularProducts, REASON } = await import("@/lib/recommendations");
const { GET } = await import("@/app/api/products/[id]/related/route");

let n = 0;
const make = (o = {}) =>
  Product.create({
    name: `P${++n}`,
    slug: `p-${n}-${Date.now()}`,
    price: 100,
    category: "Electronics",
    stock: 5,
    status: "public",
    ...o,
  });

const buy = (products, o = {}) =>
  Order.create({
    orderNumber: `ORD-${++n}`,
    guestEmail: `b${n}@example.com`,
    items: products.map((p) => ({ product: p._id, name: p.name, quantity: 1, price: p.price })),
    shippingAddress: { fullName: "A", phone: "01700000000", address: "x", city: "Dhaka", country: "Bangladesh" },
    totalAmount: products.reduce((s, p) => s + p.price, 0),
    paymentMethod: "cod",
    paymentStatus: o.paymentStatus || "paid",
    orderStatus: o.orderStatus || "delivered",
    ...o,
  });

const names = (rows) => rows.map((r) => r.name);

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
});

describe("what people actually bought together", () => {
  it("ranks by how often two things appear in the same order", async () => {
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });
    const charger = await make({ name: "Charger" });
    const unrelated = await make({ name: "Kettle", category: "Home" });

    await buy([phone, case_]);
    await buy([phone, case_]);
    await buy([phone, charger]);
    await buy([unrelated]);

    const rows = await boughtTogether(phone._id);

    expect(rows[0].orders).toBe(2);
    expect(String(rows[0].product)).toBe(String(case_._id));
    expect(rows.map((r) => String(r.product))).not.toContain(String(phone._id)); // never itself
    expect(rows.map((r) => String(r.product))).not.toContain(String(unrelated._id));
  });

  it("works whether the id arrives as an ObjectId or as a string", async () => {
    // Aggregations do no casting, so a string id matched nothing and
    // returned silently — which meant co-purchase ranking never ran at all
    // on the home page or the cart, where the ids come from the browser.
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });
    await buy([phone, case_]);

    expect(await boughtTogether(phone._id)).toHaveLength(1);
    expect(await boughtTogether(String(phone._id))).toHaveLength(1);
    expect(await boughtTogether("not-an-id")).toEqual([]);
  });

  it("ignores baskets nobody paid for", async () => {
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });

    // Otherwise anyone could promote a product by filling carts and
    // walking away — the recommendation would cost them nothing.
    await buy([phone, case_], { paymentStatus: "pending" });

    expect(await boughtTogether(phone._id)).toEqual([]);
  });

  it("ignores cancelled and returned orders", async () => {
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });

    await buy([phone, case_], { orderStatus: "cancelled" });
    await buy([phone, case_], { orderStatus: "returned" });

    expect(await boughtTogether(phone._id)).toEqual([]);
  });
});

describe("the fallback chain", () => {
  it("prefers real purchase history over anything the catalogue says", async () => {
    const phone = await make({ name: "Phone", subcategory: "Mobiles" });
    const case_ = await make({ name: "Case", category: "Home" }); // different category
    await make({ name: "Same Shelf", subcategory: "Mobiles" });

    await buy([phone, case_]);

    const rows = await relatedProducts(phone, { limit: 4 });
    expect(rows[0].name).toBe("Case");
    expect(rows[0].reason).toBe(REASON.BOUGHT_TOGETHER);
  });

  it("falls through to the catalogue when nothing has sold yet", async () => {
    const phone = await make({ name: "Phone", subcategory: "Mobiles", brand: "Acme" });
    await make({ name: "Sibling", subcategory: "Mobiles" });
    await make({ name: "Cousin", category: "Electronics" });

    const rows = await relatedProducts(phone, { limit: 4 });

    expect(names(rows)).toContain("Sibling");
    expect(rows.find((r) => r.name === "Sibling").reason).toBe(REASON.SAME_SUBCATEGORY);
  });

  it("gives an empty row rather than inventing one when the shop has nothing else", async () => {
    const only = await make({ name: "Only Product" });
    expect(await relatedProducts(only, { limit: 4 })).toEqual([]);
  });

  it("never repeats a product across the chain", async () => {
    const phone = await make({ name: "Phone", subcategory: "Mobiles", brand: "Acme" });
    // Qualifies on subcategory, category AND brand — it must appear once.
    await make({ name: "Twin", subcategory: "Mobiles", brand: "Acme" });
    await buy([phone, await Product.findOne({ name: "Twin" })]);

    const rows = await relatedProducts(phone, { limit: 8 });
    expect(rows.filter((r) => r.name === "Twin")).toHaveLength(1);
  });

  it("never recommends the product being looked at", async () => {
    const phone = await make({ name: "Phone", subcategory: "Mobiles" });
    await make({ name: "Other", subcategory: "Mobiles" });
    await buy([phone]);

    const rows = await relatedProducts(phone, { limit: 8 });
    expect(names(rows)).not.toContain("Phone");
  });
});

describe("what a shopper must never be shown", () => {
  it("keeps draft, private and unlisted products out", async () => {
    const phone = await make({ name: "Phone" });
    const draft = await make({ name: "Draft Thing", status: "draft" });
    const priv = await make({ name: "Private Thing", status: "private" });
    const unlisted = await make({ name: "Unlisted Thing", status: "unlisted" });

    // Even with purchase history behind them — an unlisted product is
    // reachable by direct link only, which a recommendation row isn't.
    await buy([phone, draft]);
    await buy([phone, priv]);
    await buy([phone, unlisted]);

    const rows = await relatedProducts(phone, { limit: 8 });
    expect(names(rows)).toEqual([]);

    const popular = await popularProducts({ limit: 8 });
    expect(names(popular)).not.toContain("Unlisted Thing");
  });
});

describe("recommendations for a shopper", () => {
  it("combines the signal from everything in their basket", async () => {
    const phone = await make({ name: "Phone" });
    const laptop = await make({ name: "Laptop" });
    const bag = await make({ name: "Bag" });
    const case_ = await make({ name: "Case" });

    // The bag goes with both; the case only with the phone.
    await buy([phone, bag]);
    await buy([laptop, bag]);
    await buy([phone, case_]);

    const rows = await recommendedFor([String(phone._id), String(laptop._id)], { limit: 4 });
    expect(rows[0].name).toBe("Bag");
  });

  it("never recommends what they are already holding", async () => {
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });
    await buy([phone, case_]);

    const rows = await recommendedFor([String(phone._id), String(case_._id)], { limit: 8 });
    expect(names(rows)).not.toContain("Phone");
    expect(names(rows)).not.toContain("Case");
  });

  it("falls back to best sellers for somebody the shop knows nothing about", async () => {
    const popular = await make({ name: "Popular" });
    await make({ name: "Ignored" });
    await buy([popular]);
    await buy([popular]);

    const rows = await recommendedFor([], { limit: 4 });
    expect(rows[0].name).toBe("Popular");
    expect(rows[0].reason).toBe(REASON.POPULAR);
  });

  it("shrugs off rubbish from the browser instead of trusting it", async () => {
    const popular = await make({ name: "Popular" });
    await buy([popular]);

    // These ids arrive from localStorage, which anyone can edit.
    for (const seeds of [["not-an-id"], [{ $ne: null }], null, "nonsense", [{}], [123]]) {
      const rows = await recommendedFor(seeds, { limit: 4 });
      expect(Array.isArray(rows)).toBe(true);
      expect(names(rows)).toContain("Popular");
    }
  });

  it("caps how many seeds it will act on", async () => {
    const popular = await make({ name: "Popular" });
    await buy([popular]);
    // A tampered localStorage holding a thousand ids must not become a
    // thousand aggregations.
    const many = Array.from({ length: 500 }, (_, i) => String(i).padStart(24, "0"));
    const rows = await recommendedFor(many, { limit: 4 });
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("the heading only claims what the row contains", () => {
  // The API trims a row to its leading reason rather than labelling
  // category filler as something people bought together. Checked through
  // the real endpoint, since that is where the rule lives.
  const related = (id) => GET(new Request(`http://localhost/api/products/${id}/related`), { params: { id: String(id) } }).then((r) => r.json());

  it("says 'often bought together' only over products that were", async () => {
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });
    const charger = await make({ name: "Charger" });
    await make({ name: "Filler One" });
    await make({ name: "Filler Two" });

    await buy([phone, case_]);
    await buy([phone, charger]);

    const res = await related(phone._id);

    expect(res.data.label).toBe("Often bought together");
    expect(names(res.data.products).sort()).toEqual(["Case", "Charger"]);
    expect(names(res.data.products)).not.toContain("Filler One");
  });

  it("claims nothing specific when only one product truly qualifies", async () => {
    const phone = await make({ name: "Phone" });
    const case_ = await make({ name: "Case" });
    await make({ name: "Filler" });

    await buy([phone, case_]);

    const res = await related(phone._id);
    // One co-purchase is not a pattern — the row fills out and the
    // heading stops asserting a relationship.
    expect(res.data.label).toBe("You may also like");
    expect(names(res.data.products)).toContain("Filler");
  });

  it("returns an empty row, not an error, for a product that isn't on sale", async () => {
    const draft = await make({ name: "Draft", status: "draft" });
    const res = await related(draft._id);
    expect(res.success).toBe(true);
    expect(res.data.products).toEqual([]);
  });
});
