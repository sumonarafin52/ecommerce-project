// lib/productStats.js
//
// Recording what shoppers look at, and reporting what that came to.
//
// The question this exists to answer is the one a shop owner cannot answer
// from orders alone: which products are being LOOKED at and not bought. A
// product with four hundred views and two sales has a problem with its
// price, its photographs or its description — and it is invisible in a
// sales report, where it just looks like a slow seller.
//
// What these numbers are, stated plainly, because the admin page says the
// same thing: they are best-effort counters from the browser. They are
// good enough to compare products with each other and to spot a page that
// isn't converting. They are not audited figures, they can be inflated by
// anyone determined to do so, and nothing financial is ever derived from
// them — money comes from the order collection, always.
import mongoose from "mongoose";
import ProductStat from "@/models/ProductStat";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { storeTimezone, dayKey, daySpan } from "@/lib/storeTime";

const asObjectId = (id) => {
  const s = String(id || "");
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
};

export const SIGNALS = { VIEW: "view", CART: "cart" };

/**
 * Adds one to a counter.
 *
 * An upsert with $inc, so two people opening the same product at the same
 * moment both count and neither creates a duplicate row.
 */
export async function recordSignal(productId, type, { now = new Date() } = {}) {
  const id = asObjectId(productId);
  if (!id) return false;
  if (type !== SIGNALS.VIEW && type !== SIGNALS.CART) return false;

  // Only products a shopper could actually be looking at. Without this,
  // anyone could POST ids at the endpoint and grow the collection with
  // rows for products that don't exist.
  const exists = await Product.exists({ _id: id, status: { $in: ["public", "unlisted"] } });
  if (!exists) return false;

  const timezone = await storeTimezone();
  const field = type === SIGNALS.VIEW ? "views" : "addToCart";

  await ProductStat.updateOne(
    { product: id, day: dayKey(now, timezone) },
    { $inc: { [field]: 1 } },
    { upsert: true }
  );

  return true;
}

/**
 * Views, baskets and sales per product over a date range.
 *
 * Sales come from the order collection — the financial record — rather
 * than from a counter that could drift away from it.
 *
 * Rates are returned as null, not zero, when the sample is too small to
 * mean anything. "0% conversion" under three views is noise dressed as a
 * finding, and a shop owner who repriced a product on the strength of it
 * would be acting on nothing.
 */
export const MIN_VIEWS_FOR_RATE = 20;

export async function productPerformance({ from, to, limit = 100, sort = "views" } = {}) {
  const timezone = await storeTimezone();
  const days = daySpan(from, to, timezone);
  if (!days.length) return { rows: [], timezone, totals: { views: 0, addToCart: 0, units: 0 } };

  const [statRows, orderRows] = await Promise.all([
    ProductStat.aggregate([
      { $match: { day: { $in: days } } },
      { $group: { _id: "$product", views: { $sum: "$views" }, addToCart: { $sum: "$addToCart" } } },
    ]),
    // Units actually sold, on the same terms the rest of the admin uses:
    // paid, not cancelled or returned.
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(from), $lte: new Date(to) },
          paymentStatus: { $in: ["paid", "refunded"] },
          orderStatus: { $nin: ["cancelled", "returned"] },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          units: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
        },
      },
    ]),
  ]);

  const stats = new Map(statRows.map((r) => [String(r._id), r]));
  const sales = new Map(orderRows.map((r) => [String(r._id), r]));

  // Every product that did something in the range — looked at, basketed or
  // bought. A product nobody touched at all is not a finding.
  const ids = [...new Set([...stats.keys(), ...sales.keys()])];
  if (!ids.length) return { rows: [], timezone, totals: { views: 0, addToCart: 0, units: 0 } };

  const products = await Product.find({ _id: { $in: ids.map(asObjectId).filter(Boolean) } })
    .select("name slug images price discountPrice category stock status")
    .lean();

  const rows = products.map((p) => {
    const key = String(p._id);
    const views = stats.get(key)?.views || 0;
    const addToCart = stats.get(key)?.addToCart || 0;
    const units = sales.get(key)?.units || 0;
    const revenue = sales.get(key)?.revenue || 0;

    const enough = views >= MIN_VIEWS_FOR_RATE;
    const pct = (n) => Math.round((n / views) * 1000) / 10;

    return {
      _id: key,
      name: p.name,
      slug: p.slug || "",
      image: p.images?.[0] || "",
      category: p.category,
      price: p.discountPrice > 0 ? p.discountPrice : p.price,
      stock: p.stock,
      status: p.status,
      views,
      addToCart,
      units,
      revenue,
      // null means "not enough to say", and the page prints a dash.
      cartRate: enough ? pct(addToCart) : null,
      buyRate: enough ? pct(units) : null,
    };
  });

  const by = {
    views: (a, b) => b.views - a.views,
    units: (a, b) => b.units - a.units,
    revenue: (a, b) => b.revenue - a.revenue,
    // Worst first, and only among products with enough views to judge.
    worst: (a, b) => (a.buyRate ?? 101) - (b.buyRate ?? 101),
  };

  return {
    rows: rows.sort(by[sort] || by.views).slice(0, limit),
    timezone,
    totals: {
      views: rows.reduce((s, r) => s + r.views, 0),
      addToCart: rows.reduce((s, r) => s + r.addToCart, 0),
      units: rows.reduce((s, r) => s + r.units, 0),
    },
    minViewsForRate: MIN_VIEWS_FOR_RATE,
  };
}

/**
 * The products worth looking at first: plenty of interest, little buying.
 *
 * Only products with enough views to be a signal rather than a coincidence,
 * and only ones currently on public sale — a draft product converting
 * badly is not news.
 */
export function needsAttention(rows, { minViews = MIN_VIEWS_FOR_RATE } = {}) {
  return rows
    .filter((r) => r.status === "public" && r.views >= minViews && r.buyRate !== null && r.units === 0)
    .sort((a, b) => b.views - a.views);
}
