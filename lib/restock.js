// lib/restock.js
//
// What to reorder, and how urgently.
//
// The admin could already say "twelve products are low". That is a count,
// not a decision: a product with four left that sells one a month is fine,
// and a product with eight left that sells four a day is an emergency next
// week. The difference is how fast it moves, which the stock ledger now
// knows (models/StockMovement.js).
//
// So this works out, per product and per variant:
//   velocity — units actually sold per day, over a window
//   cover    — how many days the stock on hand will last at that rate
//   suggest  — how many to order to get back to a target number of days
//
// Where the history is too thin to mean anything, it says so instead of
// extrapolating. One sale in a fortnight is not a rate, and a reorder
// quantity computed from it would be a guess wearing a number's clothes.
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import { STOCK_REASONS } from "@/lib/stockReasons";

/** Days of sales history to average over. */
export const VELOCITY_WINDOW_DAYS = 30;

/** Below this many sold in the window, a rate is not worth computing. */
export const MIN_UNITS_FOR_VELOCITY = 3;

/** How many days of stock a reorder aims to put back on the shelf. */
export const TARGET_COVER_DAYS = 30;

/** Anything selling out within this many days needs attention now. */
export const URGENT_COVER_DAYS = 7;

/**
 * Units sold per day, per product and variant, over the window.
 *
 * Taken from the ledger's sale rows rather than from orders, because the
 * ledger is already variant-aware and already excludes the sales that were
 * cancelled — a cancelled order's units come back as their own row, so the
 * two net out exactly as they should.
 */
export async function salesVelocity({ days = VELOCITY_WINDOW_DAYS, now = Date.now() } = {}) {
  const since = new Date(now - days * 864e5);

  const rows = await StockMovement.aggregate([
    { $match: { reason: STOCK_REASONS.SALE, at: { $gte: since } } },
    {
      $group: {
        _id: { product: "$product", key: "$combinationKey" },
        // Sale rows are negative, so this is units out.
        units: { $sum: { $abs: "$delta" } },
        // When the first of them happened, so a product that only went on
        // sale last week isn't averaged over a month it didn't exist for.
        firstAt: { $min: "$at" },
      },
    },
  ]);

  const map = new Map();
  for (const r of rows) {
    // The day of the first sale counts as a day of selling. Measuring
    // only the span BETWEEN the first and last sale overstates the rate on
    // short histories — ten sales across ten days came out as 1.11 a day
    // rather than 1 — and an overstated rate means over-ordering and
    // premature "running out" warnings.
    const elapsedDays = Math.max(1, Math.min(days, (now - new Date(r.firstAt).getTime()) / 864e5 + 1));
    map.set(`${r._id.product}::${r._id.key || ""}`, {
      units: r.units,
      perDay: r.units / elapsedDays,
      days: elapsedDays,
    });
  }
  return map;
}

/**
 * One line of the restock list.
 *
 * `cover` and `suggest` are null when there isn't enough history — the page
 * prints a dash rather than a number nobody should act on.
 */
function buildLine({ product, combinationKey, stock, threshold, sales, targetDays }) {
  const enough = sales && sales.units >= MIN_UNITS_FOR_VELOCITY;
  const perDay = enough ? sales.perDay : null;

  // Days of cover. A product with stock and no sales isn't "infinite
  // cover", it's a product nobody is buying — which is a different
  // problem, and one the performance page already names.
  const cover = perDay && perDay > 0 ? stock / perDay : null;

  // Enough to reach the target, rounded up, never negative.
  const suggest = perDay && perDay > 0 ? Math.max(0, Math.ceil(perDay * targetDays - stock)) : null;

  return {
    combinationKey: combinationKey || "",
    stock,
    threshold,
    soldInWindow: sales?.units || 0,
    perDay: perDay === null ? null : Math.round(perDay * 100) / 100,
    coverDays: cover === null ? null : Math.round(cover * 10) / 10,
    suggest,
    // Out of stock is urgent whether or not it sells quickly — it cannot
    // sell at all in that state.
    urgent: stock <= 0 || (cover !== null && cover <= URGENT_COVER_DAYS),
    outOfStock: stock <= 0,
    low: stock > 0 && stock <= threshold,
  };
}

/**
 * The restock list: everything out of stock, below its threshold, or due
 * to run out inside the target window, worst first.
 *
 * Products nobody is buying and nothing is wrong with are left out — a
 * list that includes everything is a list nobody opens.
 */
export async function restockList({
  days = VELOCITY_WINDOW_DAYS,
  targetDays = TARGET_COVER_DAYS,
  now = Date.now(),
  limit = 100,
} = {}) {
  const velocity = await salesVelocity({ days, now });

  // Only products that can actually be sold — a draft running low is not
  // a problem anyone needs to act on today.
  const products = await Product.find({ status: { $in: ["public", "unlisted"] } })
    .select("name slug stock lowStockThreshold combinations category status")
    .lean();

  const rows = [];

  for (const p of products) {
    const threshold = p.lowStockThreshold ?? 5;
    const lines = [];

    if (p.combinations?.length) {
      // Each variant holds its own stock, so each is its own decision.
      for (const combo of p.combinations) {
        if (combo.active === false) continue;
        lines.push(
          buildLine({
            product: p,
            combinationKey: combo.key,
            stock: combo.stock ?? 0,
            threshold,
            sales: velocity.get(`${p._id}::${combo.key}`),
            targetDays,
          })
        );
      }
    } else {
      lines.push(
        buildLine({
          product: p,
          combinationKey: "",
          stock: p.stock ?? 0,
          threshold,
          sales: velocity.get(`${p._id}::`),
          targetDays,
        })
      );
    }

    for (const line of lines) {
      // Worth listing if it's empty, below the threshold, or on course to
      // run out before a reorder could reasonably arrive.
      const needsAttention = line.outOfStock || line.low || (line.coverDays !== null && line.coverDays <= targetDays);
      if (!needsAttention) continue;

      rows.push({
        _id: String(p._id),
        name: p.name,
        category: p.category,
        status: p.status,
        ...line,
      });
    }
  }

  // Emptiest first, then soonest to run out. A product already at zero is
  // losing sales right now; one with four days of cover is losing them on
  // Friday.
  rows.sort((a, b) => {
    if (a.outOfStock !== b.outOfStock) return a.outOfStock ? -1 : 1;
    const ac = a.coverDays ?? Infinity;
    const bc = b.coverDays ?? Infinity;
    if (ac !== bc) return ac - bc;
    return a.stock - b.stock;
  });

  return {
    rows: rows.slice(0, limit),
    summary: {
      outOfStock: rows.filter((r) => r.outOfStock).length,
      urgent: rows.filter((r) => r.urgent && !r.outOfStock).length,
      low: rows.filter((r) => r.low && !r.outOfStock).length,
      windowDays: days,
      targetDays,
      minUnits: MIN_UNITS_FOR_VELOCITY,
    },
  };
}
