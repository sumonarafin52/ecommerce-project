// tests/productSearch.test.js
//
// How people actually type into a search box.
//
// The two failures these cover both returned ZERO results, which is the
// worst thing a shop's search can do — the goods are there, the shopper
// typed something reasonable, and the shop says it has nothing:
//
//   "mouse wireless"  — the right words in the shopper's order, not the
//                       catalogue's. The query used to be matched as one
//                       literal substring, so only the catalogue's own
//                       word order found anything.
//   "cofee mug"       — one letter wrong in a two-word search. Typo
//                       tolerance compared the whole query against a whole
//                       field, so it only ever rescued single words.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";

const { searchProducts, searchTerms, buildProductQuery, searchFallbacks } = await import("@/lib/productSearch");

const find = async (q, extra = {}) =>
  searchProducts({ params: { q, ...extra }, canManage: false, page: 1, limit: 20 });

const names = (res) => res.products.map((p) => p.name);

// Every RegExp anywhere in a built query, as its pattern text.
const regexSources = (node) => {
  if (node instanceof RegExp) return [node.source];
  if (Array.isArray(node)) return node.flatMap(regexSources);
  if (node && typeof node === "object") return Object.values(node).flatMap(regexSources);
  return [];
};

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  await Product.create([
    { name: "Wireless Gaming Mouse Pro", category: "Electronics", brand: "Logitech", sku: "MOU-1", price: 2400, stock: 10, status: "public", tags: ["gaming", "wireless"] },
    { name: "Mechanical Keyboard RGB", category: "Electronics", brand: "Logitech", sku: "KEY-1", price: 4500, stock: 10, status: "public", tags: ["gaming"] },
    { name: "Ceramic Coffee Mug", category: "Home", brand: "Local", sku: "MUG-9", price: 450, stock: 10, status: "public", tags: ["kitchen"] },
    { name: "Stainless Steel Water Bottle", category: "Home", brand: "Local", sku: "BOT-1", price: 850, stock: 10, status: "public", tags: ["kitchen"] },
    { name: "Secret Draft Thing", category: "Home", brand: "Local", sku: "DRF-1", price: 99, stock: 1, status: "draft" },
  ]);
});

describe("words in the shopper's order, not the catalogue's", () => {
  it("finds a product however the words are arranged", async () => {
    for (const q of ["wireless mouse", "mouse wireless", "pro mouse", "gaming wireless mouse"]) {
      expect(names(await find(q)), q).toContain("Wireless Gaming Mouse Pro");
    }
  });

  it("combines a word from one field with a word from another", async () => {
    // "Logitech" is the brand and "keyboard" is in the name — no single
    // field holds both, so a whole-string match could never find this.
    expect(names(await find("logitech keyboard"))).toEqual(["Mechanical Keyboard RGB"]);
    expect(names(await find("electronics logitech"))).toHaveLength(2);
  });

  it("narrows as more words are added, rather than widening", async () => {
    expect((await find("logitech")).total).toBe(2);
    expect((await find("logitech mouse")).total).toBe(1);
    // every word has to match something — this pairs two different products
    expect((await find("logitech bottle")).total).toBe(0);
  });

  it("still matches a SKU, a brand and a tag on their own", async () => {
    expect(names(await find("MOU-1"))).toEqual(["Wireless Gaming Mouse Pro"]);
    expect((await find("logitech")).total).toBe(2);
    expect((await find("kitchen")).total).toBe(2);
  });
});

describe("one letter wrong", () => {
  it("rescues a misspelled word inside a multi-word search", async () => {
    const res = await find("cofee mug");
    expect(names(res)).toEqual(["Ceramic Coffee Mug"]);
    // and says so, so the page can tell the shopper what it assumed
    expect(res.didYouMean).toBe(true);
  });

  it("rescues a typo in any position", async () => {
    expect(names(await find("gaming mose"))).toContain("Wireless Gaming Mouse Pro");
    expect(names(await find("mechanial keyboard"))).toContain("Mechanical Keyboard RGB");
  });

  it("still rescues a single misspelled word", async () => {
    const res = await find("keybord");
    expect(names(res)).toEqual(["Mechanical Keyboard RGB"]);
    expect(res.didYouMean).toBe(true);
  });

  it("does not invent a match for a word that is nothing like the catalogue", async () => {
    // The point of a typo budget: "zzzz" must not quietly become "mug".
    for (const q of ["zzzz", "qqqq wxyz", "kjhgf"]) {
      expect((await find(q)).total, q).toBe(0);
    }
  });

  it("keeps the budget tight on short words", async () => {
    // At a distance of 2 a three-letter word reaches half the shop: "mug"
    // would match "bag", "bat", "mat". Short words get one edit, not two.
    const res = await find("bag");
    expect(names(res)).not.toContain("Ceramic Coffee Mug");
  });
});

describe("what search must never do", () => {
  it("never shows a draft product to a shopper", async () => {
    for (const q of ["secret", "draft thing", "secrt draft"]) {
      expect(names(await find(q)), q).not.toContain("Secret Draft Thing");
    }
  });

  it("does not return the whole catalogue when the query matches nothing", async () => {
    // A search that adds no conditions silently returns everything, which
    // reads as a broken filter rather than an empty result.
    expect((await find("zzzz")).total).toBe(0);
  });

  it("treats a query of only short fragments as a real search", async () => {
    // Words of one character are dropped as too broad — but if that leaves
    // nothing, the raw query is used rather than no condition at all.
    expect(searchTerms("a")).toEqual(["a"]);
    expect(searchTerms("x y")).toEqual(["x y"]);
    expect((await find("a")).total).toBeLessThan(5);
  });

  it("caps a pasted paragraph instead of building a condition per word", async () => {
    expect(searchTerms("one two three four five six seven eight nine ten")).toHaveLength(8);
  });

  it("treats a regex character as text, not as a pattern", async () => {
    // An unescaped ".*" would match every product in the shop.
    expect((await find(".*")).total).toBe(0);
    expect((await find("mug)"))).toBeTruthy();
  });
});

describe("filters still apply when typo tolerance takes over", () => {
  // The fallback used to search status-only, so a shopper who had narrowed
  // to Home and searched "mouse" was handed an Electronics mouse — with the
  // Home filter still showing as ticked.
  it("does not hand back a product from outside the chosen category", async () => {
    const res = await find("mouse", { category: "Home" });
    expect(names(res)).not.toContain("Wireless Gaming Mouse Pro");
    expect(res.total).toBe(0);
  });

  it("keeps the price filter while rescuing a typo", async () => {
    // "mug" is misspelled, so only the fallback can find it — and the
    // ৳450 mug must still be excluded by a ৳1,000 floor.
    expect(names(await find("mugg"))).toEqual(["Ceramic Coffee Mug"]);
    expect((await find("mugg", { minPrice: 1000 })).total).toBe(0);
  });

  it("still rescues a typo when the filter does allow the product", async () => {
    expect(names(await find("mugg", { category: "Home" }))).toEqual(["Ceramic Coffee Mug"]);
  });
});

describe("what to try when nothing was found", () => {
  it("names the words that do find something, with real counts", async () => {
    const { terms } = await searchFallbacks({ params: { q: "logitech bottle" }, canManage: false });
    expect(terms).toEqual([
      { term: "logitech", count: 2 },
      { term: "bottle", count: 1 },
    ]);
  });

  it("offers nothing when no word matches — better silence than a wrong hint", async () => {
    const { terms } = await searchFallbacks({ params: { q: "zzzz qqqq" }, canManage: false });
    expect(terms).toEqual([]);
  });

  it("counts what the same words find once the filters are dropped", async () => {
    const { withoutFilters } = await searchFallbacks({ params: { q: "mouse" }, canManage: false });
    expect(withoutFilters).toBe(1);
  });

  it("never suggests a draft product's words to a shopper", async () => {
    const { withoutFilters, terms } = await searchFallbacks({ params: { q: "secret draft" }, canManage: false });
    expect(withoutFilters).toBe(0);
    expect(terms).toEqual([]);
  });
});

describe("the two names for the search parameter", () => {
  it("accepts search as well as q", async () => {
    // The storefront URL and the site's search schema both use ?search=,
    // while the admin and this library use q. A caller using the other
    // spelling used to get the entire catalogue back with no error.
    const viaSearch = await searchProducts({ params: { search: "mouse" }, canManage: false, page: 1, limit: 20 });
    expect(names(viaSearch)).toEqual(["Wireless Gaming Mouse Pro"]);

    // JSON.stringify renders a RegExp as {}, so the term has to be read off
    // the pattern itself rather than a stringified copy of the query.
    const query = buildProductQuery({ search: "zzzz" }, false);
    expect(regexSources(query)).toContain("zzzz");
  });
});
