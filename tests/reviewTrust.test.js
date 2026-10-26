// tests/reviewTrust.test.js
//
// Review trust signals: who may review, the verified-purchase badge, helpful
// votes, and reporting.
//
// The first group covers a real bug: eligibility required an order with
// orderStatus "delivered", which a download-only order never reaches — so a
// digital product could never be reviewed by anyone.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import Review from "@/models/Review";
import DigitalProduct from "@/models/DigitalProduct";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const reviewsRoute = await import("@/app/api/reviews/route");
const helpfulRoute = await import("@/app/api/reviews/[id]/helpful/route");
const reportRoute = await import("@/app/api/reviews/[id]/report/route");

let ip = 0;
const nextIp = () => `10.7.${Math.floor(++ip / 250)}.${ip % 250}`;

const postReview = (body) =>
  reviewsRoute.POST(
    new Request("http://x/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    })
  );
const getReviews = (productId, sort = "helpful") =>
  reviewsRoute.GET(new Request(`http://x/api/reviews?product=${productId}&sort=${sort}`));
const markHelpful = (id) =>
  helpfulRoute.POST(new Request(`http://x/api/reviews/${id}/helpful`, { method: "POST" }), {
    params: { id: String(id) },
  });
const report = (id, body = {}) =>
  reportRoute.POST(
    new Request(`http://x/api/reviews/${id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    }),
    { params: { id: String(id) } }
  );

let buyer, other, physical, digital;
let orderNo = 700;

const makeOrder = (user, product, over = {}) =>
  Order.create({
    orderNumber: `SM-000${orderNo++}`,
    user: user._id,
    items: [{ product: product._id, name: product.name, price: 100, quantity: 1 }],
    shippingAddress: { fullName: user.name, phone: "01700000000", address: "A", city: "Dhaka" },
    paymentMethod: "cod",
    totalAmount: 100,
    ...over,
  });

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});

  buyer = await User.create({ name: "Buyer", email: "b@test.com", password: "x".repeat(20) });
  other = await User.create({ name: "Other", email: "o@test.com", password: "x".repeat(20) });

  physical = await Product.create({
    name: "Mug",
    slug: `mug${Math.random()}`,
    description: "d",
    price: 100,
    category: "Home",
    stock: 10,
  });

  const dp = await DigitalProduct.create({
    title: "Ebook",
    fileUrl: "https://res.cloudinary.com/demo/raw/upload/a.pdf",
  });
  digital = await Product.create({
    name: "Ebook",
    slug: `eb${Math.random()}`,
    description: "d",
    price: 200,
    category: "Books",
    stock: 99,
    digitalProduct: dp._id,
  });

  mockSession = { user: { id: String(buyer._id), name: buyer.name, role: "customer" } };
});

describe("who may review", () => {
  it("a physical product still needs a delivered order", async () => {
    await makeOrder(buyer, physical, { orderStatus: "processing", paymentStatus: "paid" });
    const refused = await postReview({ product: String(physical._id), rating: 5 });
    expect(refused.status).toBe(400);
    expect((await refused.json()).message).toMatch(/delivered/i);

    await Order.updateMany({ user: buyer._id }, { $set: { orderStatus: "delivered" } });
    expect((await postReview({ product: String(physical._id), rating: 5 })).status).toBe(201);
  });

  it("a digital product can be reviewed once paid — it is never 'delivered'", async () => {
    // This is the bug: a download-only order sits at "processing" forever, so
    // the old delivered-only rule locked digital buyers out permanently.
    await makeOrder(buyer, digital, {
      orderStatus: "processing",
      paymentStatus: "paid",
      requiresShipping: false,
      paymentMethod: "sslcommerz",
    });

    const res = await postReview({ product: String(digital._id), rating: 4, comment: "Great ebook" });
    expect(res.status).toBe(201);
    expect(await Review.countDocuments({ product: digital._id })).toBe(1);
  });

  it("an unpaid digital order still can't review", async () => {
    await makeOrder(buyer, digital, { orderStatus: "pending", paymentStatus: "pending", requiresShipping: false });
    const res = await postReview({ product: String(digital._id), rating: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/payment/i);
  });

  it("a cancelled or returned digital order can't review", async () => {
    await makeOrder(buyer, digital, {
      orderStatus: "cancelled",
      paymentStatus: "paid",
      requiresShipping: false,
    });
    expect((await postReview({ product: String(digital._id), rating: 5 })).status).toBe(400);
  });

  it("somebody who never bought it can't review", async () => {
    await makeOrder(buyer, physical, { orderStatus: "delivered" });
    mockSession = { user: { id: String(other._id), name: other.name, role: "customer" } };
    expect((await postReview({ product: String(physical._id), rating: 1 })).status).toBe(400);
  });

  it("records the verified-purchase flag on the review", async () => {
    await makeOrder(buyer, physical, { orderStatus: "delivered" });
    await postReview({ product: String(physical._id), rating: 5 });
    expect((await Review.findOne({ product: physical._id })).verifiedPurchase).toBe(true);
  });
});

describe("what the storefront receives", () => {
  let review;

  beforeEach(async () => {
    await makeOrder(buyer, physical, { orderStatus: "delivered" });
    await postReview({ product: String(physical._id), rating: 5, comment: "Lovely" });
    review = await Review.findOne({ product: physical._id });
  });

  it("never exposes who voted or who reported", async () => {
    mockSession = { user: { id: String(other._id), name: other.name, role: "customer" } };
    await markHelpful(review._id);
    await report(review._id, { reason: "spam", note: "secret note" });

    const { data } = await (await getReviews(physical._id)).json();
    const body = JSON.stringify(data);
    expect(body).not.toContain(String(other._id));
    expect(body).not.toContain("secret note");
    expect(body).not.toContain("reports");
    // but the aggregate count is public
    expect(data[0].helpfulCount).toBe(1);
  });

  it("tells the viewer their own vote and report state, not anyone else's", async () => {
    mockSession = { user: { id: String(other._id), name: other.name, role: "customer" } };
    await markHelpful(review._id);

    const mine = await (await getReviews(physical._id)).json();
    expect(mine.data[0].viewerFoundHelpful).toBe(true);
    expect(mine.data[0].viewerIsAuthor).toBe(false);

    mockSession = { user: { id: String(buyer._id), name: buyer.name, role: "customer" } };
    const asAuthor = await (await getReviews(physical._id)).json();
    expect(asAuthor.data[0].viewerFoundHelpful).toBe(false);
    expect(asAuthor.data[0].viewerIsAuthor).toBe(true);
  });

  it("works for a signed-out visitor", async () => {
    mockSession = null;
    const { data } = await (await getReviews(physical._id)).json();
    expect(data).toHaveLength(1);
    expect(data[0].viewerFoundHelpful).toBe(false);
    expect(data[0].verifiedPurchase).toBe(true);
  });

  it("hides hidden reviews from the storefront", async () => {
    await Review.updateOne({ _id: review._id }, { $set: { status: "hidden" } });
    const { data } = await (await getReviews(physical._id)).json();
    expect(data).toHaveLength(0);
  });
});

describe("helpful votes", () => {
  let review;

  beforeEach(async () => {
    await makeOrder(buyer, physical, { orderStatus: "delivered" });
    await postReview({ product: String(physical._id), rating: 5, comment: "Lovely" });
    review = await Review.findOne({ product: physical._id });
    mockSession = { user: { id: String(other._id), name: other.name, role: "customer" } };
  });

  it("toggles rather than stacking — one person counts once", async () => {
    const first = await (await markHelpful(review._id)).json();
    expect(first.data.helpfulCount).toBe(1);
    expect(first.data.viewerFoundHelpful).toBe(true);

    // clicking again takes the vote back
    const second = await (await markHelpful(review._id)).json();
    expect(second.data.helpfulCount).toBe(0);
    expect(second.data.viewerFoundHelpful).toBe(false);

    // and again re-adds it, still only once
    await markHelpful(review._id);
    expect((await Review.findById(review._id)).helpfulVotes).toHaveLength(1);
  });

  it("refuses a vote on your own review", async () => {
    mockSession = { user: { id: String(buyer._id), name: buyer.name, role: "customer" } };
    const res = await markHelpful(review._id);
    expect(res.status).toBe(400);
    expect((await Review.findById(review._id)).helpfulVotes).toHaveLength(0);
  });

  it("requires signing in", async () => {
    mockSession = null;
    expect((await markHelpful(review._id)).status).toBe(401);
  });

  it("refuses a hidden review and a malformed id without a server error", async () => {
    await Review.updateOne({ _id: review._id }, { $set: { status: "hidden" } });
    expect((await markHelpful(review._id)).status).toBe(404);
    expect((await markHelpful("not-an-id")).status).toBe(404);
  });

  it("sorts most-helpful first, newest breaking ties", async () => {
    // a second reviewer on the same product
    await makeOrder(other, physical, { orderStatus: "delivered" });
    await postReview({ product: String(physical._id), rating: 3, comment: "Okay" });

    const second = await Review.findOne({ product: physical._id, user: other._id });
    // buyer votes the second review helpful
    mockSession = { user: { id: String(buyer._id), name: buyer.name, role: "customer" } };
    await markHelpful(second._id);

    const { data } = await (await getReviews(physical._id, "helpful")).json();
    expect(data[0]._id).toBe(String(second._id));
    expect(data[0].helpfulCount).toBe(1);

    const byRating = await (await getReviews(physical._id, "highest")).json();
    expect(byRating.data[0].rating).toBe(5);
    const lowest = await (await getReviews(physical._id, "lowest")).json();
    expect(lowest.data[0].rating).toBe(3);
  });
});

describe("reporting a review", () => {
  let review;

  beforeEach(async () => {
    await makeOrder(buyer, physical, { orderStatus: "delivered" });
    await postReview({ product: String(physical._id), rating: 1, comment: "Terrible" });
    review = await Review.findOne({ product: physical._id });
    mockSession = { user: { id: String(other._id), name: other.name, role: "customer" } };
  });

  it("records the report but does NOT hide the review", async () => {
    const res = await report(review._id, { reason: "fake", note: "Competitor" });
    expect(res.status).toBe(200);

    const after = await Review.findById(review._id);
    expect(after.reports).toHaveLength(1);
    expect(after.reports[0].reason).toBe("fake");
    // reports queue a review for a human — they never bury it themselves
    expect(after.status).toBe("published");
  });

  it("many reports still don't hide it", async () => {
    for (let i = 0; i < 6; i++) {
      const u = await User.create({ name: `U${i}`, email: `u${i}@t.com`, password: "x".repeat(20) });
      mockSession = { user: { id: String(u._id), name: u.name, role: "customer" } };
      await report(review._id, { reason: "spam" });
    }
    const after = await Review.findById(review._id);
    expect(after.reports).toHaveLength(6);
    expect(after.status).toBe("published");
  });

  it("the same person reporting twice adds one report", async () => {
    await report(review._id, { reason: "spam" });
    await report(review._id, { reason: "offensive" });
    expect((await Review.findById(review._id)).reports).toHaveLength(1);
  });

  it("falls back to 'other' for an unknown reason instead of failing", async () => {
    await report(review._id, { reason: "because-i-say-so" });
    expect((await Review.findById(review._id)).reports[0].reason).toBe("other");
  });

  it("a new report reopens a review staff had already cleared", async () => {
    await Review.updateOne({ _id: review._id }, { $set: { reportsResolvedAt: new Date() } });
    await report(review._id, { reason: "spam" });
    expect((await Review.findById(review._id)).reportsResolvedAt).toBeNull();
  });

  it("requires signing in", async () => {
    mockSession = null;
    expect((await report(review._id, { reason: "spam" })).status).toBe(401);
  });

  it("rate limits one account mass-reporting", async () => {
    const targets = [];
    for (let i = 0; i < 12; i++) {
      const u = await User.create({ name: `R${i}`, email: `r${i}@t.com`, password: "x".repeat(20) });
      const p = await Product.create({
        name: `P${i}`,
        slug: `p${i}-${Math.random()}`,
        description: "d",
        price: 10,
        category: "C",
        stock: 5,
      });
      const rev = await Review.create({ product: p._id, user: u._id, rating: 1, comment: "x" });
      targets.push(rev._id);
    }
    mockSession = { user: { id: String(other._id), name: other.name, role: "customer" } };

    const codes = [];
    for (const t of targets) codes.push((await report(t, { reason: "spam" })).status);
    expect(codes).toContain(429);
  });
});
