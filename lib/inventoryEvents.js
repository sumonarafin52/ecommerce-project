// lib/inventoryEvents.js
//
// Side-effects of stock moving up or down. Everything here runs AFTER the
// main operation (order placed, product restocked) has committed, and
// swallows its own errors — a failed notification must never undo or fail
// the operation that triggered it.
import Product from "@/models/Product";
import StockAlert from "@/models/StockAlert";
import User from "@/models/User";
import { notify } from "@/lib/notify";

function availableStock(product, combinationKey) {
  if (combinationKey) {
    const combo = (product.combinations || []).find((c) => c.key === combinationKey);
    return combo && combo.active !== false ? combo.stock || 0 : 0;
  }
  return product.stock || 0;
}

/**
 * Notifies every customer waiting on this product (or one of its variants)
 * whose item is now actually in stock. Call after anything that can raise
 * stock: an admin editing the product, or stock returned from a cancelled
 * order / failed payment / accepted return.
 */
export async function notifyBackInStock(productId) {
  try {
    const product = await Product.findById(productId).select("name stock combinations status").lean();
    if (!product || product.status !== "public") return 0;

    const pending = await StockAlert.find({ product: productId, notifiedAt: null }).lean();
    let sent = 0;

    for (const alert of pending) {
      if (availableStock(product, alert.combinationKey) <= 0) continue;

      // Claim the alert atomically before notifying, so two restocks racing
      // (or a retry) can never email the same customer twice.
      const claimed = await StockAlert.findOneAndUpdate(
        { _id: alert._id, notifiedAt: null },
        { $set: { notifiedAt: new Date() } }
      );
      if (!claimed) continue;

      const label = alert.combinationKey ? `${product.name} (${alert.combinationKey})` : product.name;
      await notify({
        user: alert.user,
        type: "stock_alert",
        title: "Back in stock",
        message: `Good news — ${label} is available again. Stock can go fast, so grab it while you can.`,
        link: `/products/${productId}`,
      });
      sent++;
    }
    return sent;
  } catch (err) {
    console.error("[inventory] back-in-stock notify failed:", err.message);
    return 0;
  }
}

/**
 * Warns admins when a sale pushes stock across the low-stock threshold, or
 * sells it out entirely. Only fires on the crossing — not on every sale
 * while already low — so it stays a useful signal rather than noise.
 *
 * @param items  the order's line items ({ product, combinationKey, quantity })
 */
export async function checkLowStock(items) {
  try {
    const alerts = [];
    for (const it of items) {
      const product = await Product.findById(it.product).select("name stock combinations lowStockThreshold").lean();
      if (!product) continue;

      const after = availableStock(product, it.combinationKey);
      const before = after + it.quantity;
      const threshold = product.lowStockThreshold ?? 5;
      const label = it.combinationKey ? `${product.name} (${it.combinationKey})` : product.name;

      if (after <= 0 && before > 0) {
        alerts.push({ title: "Sold out", message: `${label} just sold out. Restock it so you don't miss further orders.`, product });
      } else if (after <= threshold && before > threshold) {
        alerts.push({ title: "Running low", message: `${label} is down to ${after} left (your low-stock threshold is ${threshold}).`, product });
      }
    }
    if (!alerts.length) return 0;

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const a of alerts) {
      for (const admin of admins) {
        await notify({
          user: admin._id,
          type: "inventory",
          title: a.title,
          message: a.message,
          link: `/admin/products/${a.product._id}/edit`,
        });
      }
    }
    return alerts.length;
  } catch (err) {
    console.error("[inventory] low-stock check failed:", err.message);
    return 0;
  }
}
