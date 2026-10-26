// lib/productStock.js
//
// Every change to a stock number goes through this file, which is why the
// movement ledger is written here rather than at each of the six call
// sites. A seventh caller gets recorded automatically; a caller that
// forgot to log would be invisible, which is the situation this replaces.
import Product from "@/models/Product";
import StockMovement, { STOCK_REASONS } from "@/models/StockMovement";

/**
 * Writes one ledger row. Never throws: a failure to record history must
 * not roll back the stock change itself or fail the order that caused it.
 * A missing row is a gap in a report; a failed order is a lost customer.
 *
 * `balanceAfter` is read back from the product after the change, so the
 * ledger records what the number actually became rather than what the
 * caller expected — the two differing is exactly the kind of drift this
 * exists to make visible.
 */
export async function recordMovement({ product, combinationKey = "", delta, reason, order = null, by = null, note = "", session = null }) {
  try {
    if (!delta || !reason) return;

    const doc = await Product.findById(product).select("stock combinations").session(session || null).lean();
    let balanceAfter = null;
    if (doc) {
      balanceAfter = combinationKey
        ? (doc.combinations || []).find((c) => c.key === combinationKey)?.stock ?? null
        : doc.stock ?? null;
    }

    await StockMovement.create(
      [{
        product,
        combinationKey: combinationKey || "",
        delta,
        balanceAfter,
        reason,
        order,
        by: { user: by?.id || null, name: by?.name || "" },
        note: String(note || "").slice(0, 300),
        at: new Date(),
      }],
      session ? { session } : {}
    );
  } catch (err) {
    console.error("[stock] could not record movement:", err.message);
  }
}

/**
 * Restores (or removes, with a negative quantity) stock for a set of order
 * items. Each item's `combinationKey` (if any) determines whether the
 * adjustment lands on a specific variant's stock or the base product's —
 * getting this wrong was a real bug: for a while, every stock adjustment
 * anywhere in the order lifecycle (create, cancel, delete) only ever
 * touched product.stock, even for items that were actually a specific
 * variant with its own separate stock count.
 *
 * @param {Array<{product: string, quantity: number, combinationKey?: string}>} items
 * @param {number} sign +1 to add stock back (cancel/delete), -1 to remove it
 */
export async function adjustStock(items, sign = 1, session = null, context = {}) {
  for (const it of items) {
    const delta = sign * it.quantity;
    if (it.combinationKey) {
      await Product.updateOne(
        { _id: it.product, "combinations.key": it.combinationKey },
        { $inc: { "combinations.$.stock": delta } },
        { session }
      );
    } else {
      await Product.updateOne({ _id: it.product }, { $inc: { stock: delta } }, { session });
    }

    // `context` says why. A caller that passes none still moves stock —
    // breaking an order to record history would be the wrong trade — and
    // the row is skipped rather than guessed at.
    if (context.reason) {
      await recordMovement({
        product: it.product,
        combinationKey: it.combinationKey || "",
        delta,
        reason: context.reason,
        order: context.order || null,
        by: context.by || null,
        note: context.note || "",
        session,
      });
    }
  }
}

/**
 * Atomically decrements stock for one line item, but only if enough stock
 * is actually available at the moment of the write — the availability
 * check and the decrement happen as a single MongoDB operation via a
 * `$gte` guard in the filter, so two concurrent requests reading the same
 * "5 in stock" snapshot can't both succeed in decrementing past zero. The
 * previous implementation checked stock, then decremented in a separate
 * step — a classic TOCTOU race that let the last unit of a product be
 * oversold under concurrent checkouts.
 *
 * @returns {boolean} true if the decrement succeeded, false if there
 *   genuinely wasn't enough stock available right now (caller should
 *   treat this as a 409 conflict, not a 400 validation error).
 */
export async function atomicDecrement(productId, combinationKey, quantity, session = null, context = {}) {
  if (combinationKey) {
    const res = await Product.updateOne(
      {
        _id: productId,
        combinations: { $elemMatch: { key: combinationKey, active: true, stock: { $gte: quantity } } },
      },
      { $inc: { "combinations.$.stock": -quantity } },
      { session }
    );
    if (res.modifiedCount === 1 && context.reason) {
      await recordMovement({
        product: productId,
        combinationKey,
        delta: -quantity,
        reason: context.reason,
        order: context.order || null,
        session,
      });
    }
    return res.modifiedCount === 1;
  }
  const res = await Product.updateOne(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { session }
  );
  // Only a decrement that actually happened is recorded — a refused one
  // (not enough stock) changed nothing and is not history.
  if (res.modifiedCount === 1 && context.reason) {
    await recordMovement({
      product: productId,
      combinationKey: "",
      delta: -quantity,
      reason: context.reason,
      order: context.order || null,
      session,
    });
  }
  return res.modifiedCount === 1;
}

/**
 * Sets a stock number outright, the way a person editing a product does,
 * and records the difference.
 *
 * The admin edit path used to write `stock: 40` straight onto the product,
 * which is why "someone changed it" was the one kind of movement with no
 * trace at all — and the one most likely to be questioned later.
 *
 * Returns the delta applied, or 0 when nothing changed.
 */
export async function setStock({ productId, combinationKey = "", to, reason = STOCK_REASONS.MANUAL, by = null, note = "", session = null }) {
  const next = Number(to);
  if (!Number.isFinite(next)) return 0;

  const doc = await Product.findById(productId).select("stock combinations").session(session || null).lean();
  if (!doc) return 0;

  const current = combinationKey
    ? (doc.combinations || []).find((c) => c.key === combinationKey)?.stock ?? 0
    : doc.stock ?? 0;

  const delta = next - current;
  if (delta === 0) return 0; // saving a form without touching stock is not a movement

  if (combinationKey) {
    await Product.updateOne(
      { _id: productId, "combinations.key": combinationKey },
      { $set: { "combinations.$.stock": next } },
      { session }
    );
  } else {
    await Product.updateOne({ _id: productId }, { $set: { stock: next } }, { session });
  }

  await recordMovement({ product: productId, combinationKey, delta, reason, by, note, session });
  return delta;
}
