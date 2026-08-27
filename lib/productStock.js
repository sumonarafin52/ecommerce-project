// lib/productStock.js
import Product from "@/models/Product";

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
export async function adjustStock(items, sign = 1, session = null) {
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
export async function atomicDecrement(productId, combinationKey, quantity, session = null) {
  if (combinationKey) {
    const res = await Product.updateOne(
      {
        _id: productId,
        combinations: { $elemMatch: { key: combinationKey, active: true, stock: { $gte: quantity } } },
      },
      { $inc: { "combinations.$.stock": -quantity } },
      { session }
    );
    return res.modifiedCount === 1;
  }
  const res = await Product.updateOne(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { session }
  );
  return res.modifiedCount === 1;
}
