// tests/productStock.test.js
//
// NOTE: these tests spin up a real (in-memory) MongoDB via
// mongodb-memory-server, because the thing being tested — atomic
// conditional updates preventing overselling under concurrency — can only
// be meaningfully verified against a real MongoDB engine. A mocked
// mongoose model would just return whatever the mock says and wouldn't
// prove the $gte-guarded update actually serializes concurrent writes.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import { atomicDecrement, adjustStock } from "@/lib/productStock";

beforeAll(async () => {
  await startTestDB();
}, 60000);

afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

async function makeProduct(overrides = {}) {
  return Product.create({
    name: "Test Product",
    slug: "test-product-" + Date.now() + Math.random(),
    price: 100,
    category: "Test",
    stock: 5,
    status: "public",
    ...overrides,
  });
}

describe("atomicDecrement", () => {
  it("succeeds when there is enough stock, and actually decrements it", async () => {
    const product = await makeProduct({ stock: 5 });
    const ok = await atomicDecrement(product._id, "", 3);
    expect(ok).toBe(true);

    const reloaded = await Product.findById(product._id);
    expect(reloaded.stock).toBe(2);
  });

  it("fails (returns false) and leaves stock untouched when there isn't enough", async () => {
    const product = await makeProduct({ stock: 2 });
    const ok = await atomicDecrement(product._id, "", 5);
    expect(ok).toBe(false);

    const reloaded = await Product.findById(product._id);
    expect(reloaded.stock).toBe(2); // unchanged
  });

  it("only allows ONE of two concurrent requests to buy the final unit", async () => {
    const product = await makeProduct({ stock: 1 });

    // simulate two customers racing to buy the last unit at the same time
    const [resultA, resultB] = await Promise.all([
      atomicDecrement(product._id, "", 1),
      atomicDecrement(product._id, "", 1),
    ]);

    const succeeded = [resultA, resultB].filter(Boolean).length;
    expect(succeeded).toBe(1); // exactly one should have won

    const reloaded = await Product.findById(product._id);
    expect(reloaded.stock).toBe(0); // never went negative
  });

  it("handles variant/combination stock independently of the base product", async () => {
    const product = await makeProduct({
      stock: 0, // base stock irrelevant once variants exist
      options: [{ name: "Size", values: ["S", "M"] }],
      combinations: [
        { key: "S", stock: 3, price: 0, sku: "SKU-S", active: true },
        { key: "M", stock: 0, price: 0, sku: "SKU-M", active: true },
      ],
    });

    const okSmall = await atomicDecrement(product._id, "S", 2);
    expect(okSmall).toBe(true);

    const okMedium = await atomicDecrement(product._id, "M", 1);
    expect(okMedium).toBe(false); // Medium is out of stock, must fail independently

    const reloaded = await Product.findById(product._id);
    const small = reloaded.combinations.find((c) => c.key === "S");
    const medium = reloaded.combinations.find((c) => c.key === "M");
    expect(small.stock).toBe(1);
    expect(medium.stock).toBe(0); // untouched by the failed attempt
  });

  it("rejects decrementing an inactive combination", async () => {
    const product = await makeProduct({
      stock: 0,
      options: [{ name: "Size", values: ["S"] }],
      combinations: [{ key: "S", stock: 10, price: 0, sku: "SKU-S", active: false }],
    });
    const ok = await atomicDecrement(product._id, "S", 1);
    expect(ok).toBe(false);
  });
});

describe("adjustStock (restock / rollback)", () => {
  it("adds stock back for a plain product", async () => {
    const product = await makeProduct({ stock: 2 });
    await adjustStock([{ product: product._id, quantity: 3 }], 1);
    const reloaded = await Product.findById(product._id);
    expect(reloaded.stock).toBe(5);
  });

  it("adds stock back to the correct variant, not the base product", async () => {
    const product = await makeProduct({
      stock: 100,
      options: [{ name: "Size", values: ["S"] }],
      combinations: [{ key: "S", stock: 0, price: 0, sku: "SKU-S", active: true }],
    });
    await adjustStock([{ product: product._id, combinationKey: "S", quantity: 4 }], 1);
    const reloaded = await Product.findById(product._id);
    expect(reloaded.combinations[0].stock).toBe(4);
    expect(reloaded.stock).toBe(100); // base product untouched
  });
});
