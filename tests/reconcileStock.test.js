// tests/reconcileStock.test.js
//
// Exercises scripts/reconcile-leaked-stock.js as a real child process
// against a live in-memory MongoDB, rather than re-implementing its logic
// in the test — that way what's verified is the script people actually run.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import path from "path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;
let uri;
let db;

const SCRIPT = path.resolve(process.cwd(), "scripts/reconcile-leaked-stock.js");

function runScript(extraArgs = []) {
  return execFileSync("node", [SCRIPT, ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, MONGODB_URI: uri },
  });
}

const productA = new mongoose.Types.ObjectId();
const productB = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  uri = mongod.getUri();
  await mongoose.connect(uri);
  db = mongoose.connection.db;
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const c of ["products", "orders", "discounts"]) {
    await db.collection(c).deleteMany({});
  }

  await db.collection("products").insertMany([
    { _id: productA, name: "Leaked Widget", stock: 0, status: "public" },
    {
      _id: productB,
      name: "Variant Shirt",
      stock: 50,
      status: "public",
      combinations: [
        { key: "M", stock: 0, active: true },
        { key: "L", stock: 7, active: true },
      ],
    },
  ]);
  await db.collection("discounts").insertOne({ code: "SAVE10", usedCount: 3 });

  const old = new Date(Date.now() - 48 * 3600 * 1000);
  await db.collection("orders").insertMany([
    // SHOULD be reconciled — failed payment, still holding stock
    {
      orderNumber: "ORD-A",
      paymentStatus: "failed",
      orderStatus: "pending",
      paymentMethod: "sslcommerz",
      createdAt: old,
      discountCode: "SAVE10",
      items: [
        { product: productA, quantity: 3 },
        { product: productB, quantity: 2, combinationKey: "M" },
      ],
    },
    // SHOULD be reconciled
    {
      orderNumber: "ORD-B",
      paymentStatus: "failed",
      orderStatus: "pending",
      paymentMethod: "sslcommerz",
      createdAt: old,
      items: [{ product: productA, quantity: 1 }],
    },
    // MUST be skipped — cancel flow already returned this stock
    {
      orderNumber: "ORD-C",
      paymentStatus: "failed",
      orderStatus: "cancelled",
      paymentMethod: "sslcommerz",
      createdAt: old,
      items: [{ product: productA, quantity: 99 }],
    },
    // MUST be skipped — already released
    {
      orderNumber: "ORD-D",
      paymentStatus: "failed",
      orderStatus: "pending",
      stockReleased: true,
      createdAt: old,
      items: [{ product: productA, quantity: 99 }],
    },
    // Skipped by default; only picked up with --include-abandoned
    {
      orderNumber: "ORD-E",
      paymentStatus: "pending",
      orderStatus: "pending",
      paymentMethod: "sslcommerz",
      createdAt: old,
      items: [{ product: productB, quantity: 4, combinationKey: "L" }],
    },
    // MUST be skipped — genuinely paid
    {
      orderNumber: "ORD-F",
      paymentStatus: "paid",
      orderStatus: "processing",
      createdAt: old,
      items: [{ product: productA, quantity: 99 }],
    },
  ]);
});

describe("reconcile-leaked-stock script", () => {
  it("dry run reports the right orders and writes nothing", async () => {
    const out = runScript();

    expect(out).toContain("DRY RUN");
    expect(out).toContain("Found 2 order(s)");
    expect(out).toContain("ORD-A");
    expect(out).toContain("ORD-B");
    // these must not be touched
    expect(out).not.toContain("ORD-C");
    expect(out).not.toContain("ORD-D");
    expect(out).not.toContain("ORD-F");

    // nothing written
    const a = await db.collection("products").findOne({ _id: productA });
    expect(a.stock).toBe(0);
    const coupon = await db.collection("discounts").findOne({ code: "SAVE10" });
    expect(coupon.usedCount).toBe(3);
  });

  it("--apply restores exactly the leaked stock, including variants", async () => {
    runScript(["--apply"]);

    // ORD-A returned 3 + ORD-B returned 1 = 4
    const a = await db.collection("products").findOne({ _id: productA });
    expect(a.stock).toBe(4);

    // ORD-A returned 2 to the "M" variant only; "L" and base untouched
    const b = await db.collection("products").findOne({ _id: productB });
    expect(b.combinations.find((c) => c.key === "M").stock).toBe(2);
    expect(b.combinations.find((c) => c.key === "L").stock).toBe(7);
    expect(b.stock).toBe(50);

    // one coupon usage released
    const coupon = await db.collection("discounts").findOne({ code: "SAVE10" });
    expect(coupon.usedCount).toBe(2);
  });

  it("is idempotent — a second --apply run changes nothing further", async () => {
    runScript(["--apply"]);
    const afterFirst = await db.collection("products").findOne({ _id: productA });

    const out = runScript(["--apply"]);
    expect(out).toContain("Nothing to do");

    const afterSecond = await db.collection("products").findOne({ _id: productA });
    expect(afterSecond.stock).toBe(afterFirst.stock); // no double credit
  });

  it("marks reconciled orders so they're never double-credited", async () => {
    runScript(["--apply"]);
    const a = await db.collection("orders").findOne({ orderNumber: "ORD-A" });
    expect(a.stockReleased).toBe(true);
    expect(a.activity?.some((e) => /reconciliation script/i.test(e.message))).toBe(true);
  });

  it("leaves cancelled and paid orders completely alone", async () => {
    runScript(["--apply"]);
    const cancelled = await db.collection("orders").findOne({ orderNumber: "ORD-C" });
    const paid = await db.collection("orders").findOne({ orderNumber: "ORD-F" });
    expect(cancelled.stockReleased).toBeUndefined();
    expect(paid.stockReleased).toBeUndefined();
  });

  it("only releases abandoned pending orders when explicitly asked", async () => {
    // default run ignores ORD-E
    runScript(["--apply"]);
    let b = await db.collection("products").findOne({ _id: productB });
    expect(b.combinations.find((c) => c.key === "L").stock).toBe(7); // untouched

    // with the flag it's included
    const out = runScript(["--include-abandoned", "--older-than-hours=24", "--apply"]);
    expect(out).toContain("ORD-E");
    b = await db.collection("products").findOne({ _id: productB });
    expect(b.combinations.find((c) => c.key === "L").stock).toBe(11); // 7 + 4
  });

  it("respects the age threshold for abandoned orders", async () => {
    // ORD-E is 48h old, so a 72h threshold must exclude it
    const out = runScript(["--include-abandoned", "--older-than-hours=72"]);
    expect(out).not.toContain("ORD-E");
  });
});
