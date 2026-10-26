// lib/recommendations.js
//
// What to show a shopper next, worked out from what people actually buy.
//
// What this replaces did the job in the browser: it downloaded the first
// hundred products in the catalogue and ranked them in JavaScript. That is
// wrong twice over — it ships a large payload to a phone on mobile data,
// and once a shop passes a hundred products the ranking silently becomes
// "whichever hundred came back first" rather than anything about the
// shopper. The product page's own "You may also like" had a different
// problem: same-category-only with no fallback, so a category holding one
// product showed an empty box on every visit.
//
// The strongest signal a shop owns is its own order history: people who
// bought this also bought that. It costs nothing to collect because it is
// already there, and it needs no tracking of any kind. Where history is
// thin — a new shop, a product nobody has bought yet — the chain falls back
// through the catalogue's own structure rather than showing nothing.
//
// Every row carries the REASON it was chosen, so the page can label it
// honestly ("Often bought together" vs "More in Sports") instead of
// implying a relationship the data doesn't support.
import mongoose from "mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";

/**
 * An id an aggregation will actually match on.
 *
 * Mongoose casts strings to ObjectIds for find() and friends, but an
 * aggregation pipeline gets NO casting — a $match on a string against an
 * ObjectId field simply matches nothing, with no error. That made the
 * co-purchase ranking silently do nothing everywhere the ids came from the
 * browser (the home page and the cart), quietly falling back to "more in
 * this category" while looking as if it were working.
 */
const asObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id || "");
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
};

/** Why a product is being suggested. The page turns these into headings. */
export const REASON = {
  BOUGHT_TOGETHER: "bought_together",
  SAME_SUBCATEGORY: "same_subcategory",
  SAME_CATEGORY: "same_category",
  SAME_BRAND: "same_brand",
  POPULAR: "popular",
};

export const REASON_LABEL = {
  [REASON.BOUGHT_TOGETHER]: "Often bought together",
  [REASON.SAME_SUBCATEGORY]: "Similar items",
  [REASON.SAME_CATEGORY]: "More in this category",
  [REASON.SAME_BRAND]: "More from this brand",
  [REASON.POPULAR]: "Popular right now",
};

// Orders that represent a real purchase. An abandoned, unpaid or cancelled
// basket is not evidence that two things go together — counting them would
// let anyone manufacture a recommendation by filling a cart they never pay
// for.
const REAL_PURCHASE = {
  paymentStatus: { $in: ["paid", "refunded"] },
  orderStatus: { $nin: ["cancelled", "returned"] },
};

const PUBLIC_ONLY = { status: "public" };

/** The fields a product card needs — not the whole document. */
const CARD_FIELDS = "name slug price discountPrice images category subcategory brand stock ratingAvg numReviews options status";

/**
 * Products bought in the same order as this one, most frequent first.
 *
 * One aggregation: find the orders containing this product, unwind their
 * lines, drop the product itself, and count how often each other product
 * appears. Done in the database rather than by pulling orders into Node,
 * so it stays workable as the order table grows.
 */
export async function boughtTogether(productId, { limit = 8, since = null } = {}) {
  const id = asObjectId(productId);
  if (!id) return [];

  const match = { ...REAL_PURCHASE, "items.product": id };
  if (since) match.createdAt = { $gte: since };

  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $match: { "items.product": { $ne: id } } },
    { $group: { _id: "$items.product", orders: { $sum: 1 }, units: { $sum: "$items.quantity" } } },
    { $sort: { orders: -1, units: -1 } },
    { $limit: limit * 2 }, // room to drop any that are no longer on sale
  ]);

  return rows.map((r) => ({ product: r._id, orders: r.orders, units: r.units }));
}

/** Best sellers by units actually sold, optionally within one category. */
export async function popularProducts({ limit = 8, category = "", since = null, exclude = [] } = {}) {
  const match = { ...REAL_PURCHASE };
  if (since) match.createdAt = { $gte: since };

  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $group: { _id: "$items.product", units: { $sum: "$items.quantity" } } },
    { $sort: { units: -1 } },
    { $limit: 100 },
  ]);

  const excluded = new Set(exclude.map(String));
  const ids = rows.map((r) => r._id).filter((id) => !excluded.has(String(id)));
  if (!ids.length) return [];

  const query = { _id: { $in: ids }, ...PUBLIC_ONLY };
  if (category) query.category = category;

  const products = await Product.find(query).select(CARD_FIELDS).lean();
  const order = new Map(rows.map((r, i) => [String(r._id), i]));
  return products.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id))).slice(0, limit);
}

/**
 * Fills a row of recommendations for one product.
 *
 * The chain runs strongest signal first and stops as soon as it has enough:
 *
 *   1. bought together   — real evidence from this shop's own orders
 *   2. same subcategory  — the closest thing the catalogue itself says
 *   3. same category
 *   4. same brand
 *   5. popular           — better than an empty shelf
 *
 * Draft, private and unlisted products can never appear: every step is
 * filtered to public, and an unlisted product is deliberately reachable
 * only by its direct link.
 */
export async function relatedProducts(product, { limit = 8 } = {}) {
  if (!product?._id) return [];

  const chosen = [];
  const seen = new Set([String(product._id)]);

  const take = async (query, reason, ids = null) => {
    if (chosen.length >= limit) return;
    const notSeen = { _id: { $nin: [...seen].map(String) } };
    const find = ids
      ? { _id: { $in: ids.filter((id) => !seen.has(String(id))) }, ...PUBLIC_ONLY }
      : { ...query, ...PUBLIC_ONLY, ...notSeen };

    const rows = await Product.find(find)
      .select(CARD_FIELDS)
      .sort(ids ? undefined : { numReviews: -1, createdAt: -1 })
      .limit(limit - chosen.length)
      .lean();

    // An id list carries its own ranking (how often it was bought with
    // this one), which a database sort would throw away.
    const ordered = ids
      ? rows.sort((a, b) => ids.findIndex((i) => String(i) === String(a._id)) - ids.findIndex((i) => String(i) === String(b._id)))
      : rows;

    for (const row of ordered) {
      if (seen.has(String(row._id)) || chosen.length >= limit) continue;
      seen.add(String(row._id));
      chosen.push({ ...row, reason });
    }
  };

  const together = await boughtTogether(product._id, { limit });
  if (together.length) {
    await take(null, REASON.BOUGHT_TOGETHER, together.map((t) => t.product));
  }

  if (product.subcategory) await take({ subcategory: product.subcategory }, REASON.SAME_SUBCATEGORY);
  if (product.category) await take({ category: product.category }, REASON.SAME_CATEGORY);
  if (product.brand) await take({ brand: product.brand }, REASON.SAME_BRAND);

  if (chosen.length < limit) {
    const popular = await popularProducts({ limit: limit - chosen.length, exclude: [...seen] });
    for (const row of popular) {
      if (seen.has(String(row._id))) continue;
      seen.add(String(row._id));
      chosen.push({ ...row, reason: REASON.POPULAR });
    }
  }

  return chosen;
}

/**
 * Recommendations for a shopper rather than for one product — used on the
 * home page and the cart.
 *
 * `seedIds` is what they have recently looked at or are holding in their
 * basket. It arrives from the browser, so it is treated as untrusted: ids
 * are shape-checked and capped before they reach a query.
 *
 * With no seeds at all this is simply what sells, which is an honest
 * answer to "you might like this" for somebody the shop knows nothing
 * about — rather than a shuffled catalogue dressed up as a suggestion.
 */
export async function recommendedFor(seedIds = [], { limit = 8 } = {}) {
  const seeds = [...new Set((Array.isArray(seedIds) ? seedIds : []).map(String).filter((id) => /^[0-9a-fA-F]{24}$/.test(id)))].slice(0, 10);

  if (!seeds.length) {
    const popular = await popularProducts({ limit });
    return popular.map((p) => ({ ...p, reason: REASON.POPULAR }));
  }

  const seedProducts = await Product.find({ _id: { $in: seeds } }).select("category subcategory brand").lean();

  // How often each candidate was bought alongside ANY of the seeds, summed
  // — so two seeds pointing at the same product push it up the list.
  const score = new Map();
  for (const seed of seeds) {
    for (const row of await boughtTogether(seed, { limit })) {
      const key = String(row.product);
      if (seeds.includes(key)) continue;
      score.set(key, (score.get(key) || 0) + row.orders);
    }
  }

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const chosen = [];
  const seen = new Set(seeds);

  if (ranked.length) {
    const rows = await Product.find({ _id: { $in: ranked }, ...PUBLIC_ONLY }).select(CARD_FIELDS).lean();
    rows.sort((a, b) => ranked.indexOf(String(a._id)) - ranked.indexOf(String(b._id)));
    for (const row of rows.slice(0, limit)) {
      seen.add(String(row._id));
      chosen.push({ ...row, reason: REASON.BOUGHT_TOGETHER });
    }
  }

  // Then more of what they've been looking at.
  if (chosen.length < limit) {
    const categories = [...new Set(seedProducts.map((p) => p.category).filter(Boolean))];
    if (categories.length) {
      const rows = await Product.find({ category: { $in: categories }, _id: { $nin: [...seen] }, ...PUBLIC_ONLY })
        .select(CARD_FIELDS)
        .sort({ numReviews: -1, createdAt: -1 })
        .limit(limit - chosen.length)
        .lean();
      for (const row of rows) {
        seen.add(String(row._id));
        chosen.push({ ...row, reason: REASON.SAME_CATEGORY });
      }
    }
  }

  if (chosen.length < limit) {
    const popular = await popularProducts({ limit: limit - chosen.length, exclude: [...seen] });
    for (const row of popular) chosen.push({ ...row, reason: REASON.POPULAR });
  }

  return chosen;
}
