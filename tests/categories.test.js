// tests/categories.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Category from "@/models/Category";
import Product from "@/models/Product";
import { getStorefrontCategories } from "@/lib/categories";

let n = 0;
const product = (category, status = "public") =>
  Product.create({ name: `P${++n}`, slug: `p${n}-${Date.now()}`, price: 10, category, stock: 1, status });

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => { await clearTestDB(); });

describe("storefront categories", () => {
  it("shows categories used by products even with no admin-created categories (the empty-nav bug)", async () => {
    await product("Ice Cream"); await product("Drinks");
    const cats = await getStorefrontCategories();
    expect(cats.map((c) => c.name).sort()).toEqual(["Drinks", "Ice Cream"]);
  });

  it("puts admin categories first, in their order, and never duplicates them (case-insensitive)", async () => {
    await Category.create({ name: "Zebra Things", slug: "zebra", order: 0 });
    await Category.create({ name: "Apples", slug: "apples", order: 1 });
    await product("apples"); await product("Bananas");
    const names = (await getStorefrontCategories()).map((c) => c.name);
    expect(names).toEqual(["Zebra Things", "Apples", "Bananas"]);
  });

  it("ignores categories that only draft/private products use", async () => {
    await product("Secret Stuff", "draft"); await product("Hidden", "private"); await product("Visible");
    expect((await getStorefrontCategories()).map((c) => c.name)).toEqual(["Visible"]);
  });

  it("ignores empty category names and respects the limit", async () => {
    // the model requires a category, but data can arrive around it (imports,
    // direct DB edits) — insert raw to prove blanks are still skipped
    await Product.collection.insertOne({ name: "blank", slug: "blank", price: 1, stock: 1, status: "public", category: "" });
    await product("A"); await product("B"); await product("C");
    const cats = await getStorefrontCategories(2);
    expect(cats).toHaveLength(2);
    expect(cats.every((c) => c.name)).toBe(true);
  });
});
