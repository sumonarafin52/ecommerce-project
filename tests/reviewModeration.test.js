// tests/reviewModeration.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Review from "@/models/Review";
import User from "@/models/User";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
const admin = await import("@/app/api/admin/reviews/route");
const store = await import("@/app/api/reviews/route");

const as = (role) => (mockSession = { user: { id: String(new mongoose.Types.ObjectId()), role, name: "Staff" } });
const put = (body) => admin.PUT(new Request("http://x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).then((r) => r.json());
const del = (id) => admin.DELETE(new Request(`http://x?id=${id}`, { method: "DELETE" })).then((r) => r.json());

let product, reviews;
beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  as("admin");
  product = await Product.create({ name: "Tea", slug: `t${Date.now()}`, price: 100, category: "C", stock: 5, status: "public" });
  // one review per customer per product is enforced by a unique index,
  // so each rating needs its own customer
  const users = await User.insertMany(
    [0, 1, 2].map((i) => ({ name: `Cust ${i}`, email: `c${i}_${Date.now()}@t.com`, password: "x", role: "customer" }))
  );
  // 5★, 5★, 1★ → average 3.7
  reviews = await Review.insertMany([5, 5, 1].map((rating, i) => ({ product: product._id, user: users[i]._id, rating, comment: `${rating} star` })));
  await Product.findByIdAndUpdate(product._id, { ratingAvg: 3.7, numReviews: 3 });
});

const rating = async () => {
  const p = await Product.findById(product._id).lean();
  return { avg: p.ratingAvg, n: p.numReviews };
};

describe("review moderation", () => {
  it("hiding a review removes it from the product's rating", async () => {
    const oneStar = reviews.find((r) => r.rating === 1);
    expect(await rating()).toEqual({ avg: 3.7, n: 3 });
    await put({ id: String(oneStar._id), status: "hidden" });
    expect(await rating()).toEqual({ avg: 5, n: 2 }); // 1★ no longer counts
  });

  it("publishing it again restores the rating", async () => {
    const oneStar = reviews.find((r) => r.rating === 1);
    await put({ id: String(oneStar._id), status: "hidden" });
    await put({ id: String(oneStar._id), status: "published" });
    expect(await rating()).toEqual({ avg: 3.7, n: 3 });
  });

  it("deleting recalculates too", async () => {
    await del(String(reviews[0]._id));
    expect(await rating()).toEqual({ avg: 3, n: 2 }); // (5+1)/2
  });

  it("hiding every review resets the score to zero, not a stale average", async () => {
    for (const r of reviews) await put({ id: String(r._id), status: "hidden" });
    expect(await rating()).toEqual({ avg: 0, n: 0 });
  });

  it("hidden reviews never reach the storefront", async () => {
    const oneStar = reviews.find((r) => r.rating === 1);
    await put({ id: String(oneStar._id), status: "hidden" });
    const res = await store.GET(new Request(`http://x/api/reviews?product=${product._id}`)).then((r) => r.json());
    const ratings = res.data.map((r) => r.rating).sort();
    expect(ratings).toEqual([5, 5]);
  });

  it("saves and clears a public reply", async () => {
    const id = String(reviews[0]._id);
    await put({ id, reply: "Thanks for your feedback!" });
    let r = await Review.findById(id).lean();
    expect(r.reply).toBe("Thanks for your feedback!");
    expect(r.repliedBy).toBe("Staff");
    expect(r.repliedAt).toBeTruthy();
    await put({ id, reply: "" });
    r = await Review.findById(id).lean();
    expect(r.reply).toBe("");
    expect(r.repliedAt).toBeNull();
  });

  it("rejects an over-long reply and an invalid status", async () => {
    const id = String(reviews[0]._id);
    expect((await put({ id, reply: "x".repeat(1001) })).success).toBe(false);
    expect((await put({ id, status: "deleted" })).success).toBe(false);
  });

  it("is staff-only", async () => {
    as("customer");
    const res = await admin.PUT(new Request("http://x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(reviews[0]._id), status: "hidden" }) }));
    expect(res.status).toBe(403);
    const list = await admin.GET(new Request("http://x/api/admin/reviews"));
    expect(list.status).toBe(403);
  });
});
