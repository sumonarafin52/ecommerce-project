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
export async function adjustStock(items, sign = 1) {
  for (const it of items) {
    const delta = sign * it.quantity;
    if (it.combinationKey) {
      await Product.updateOne(
        { _id: it.product, "combinations.key": it.combinationKey },
        { $inc: { "combinations.$.stock": delta } }
      );
    } else {
      await Product.findByIdAndUpdate(it.product, { $inc: { stock: delta } });
    }
  }
}
