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
import { getRolePermissions, STAFF_ROLES } from "@/lib/rbac";

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
/**
 * Who hears about stock running out.
 *
 * It used to be `role: "admin"` and nobody else, so a shop where an editor
 * or a stock manager actually looks after inventory sent its alerts to the
 * one person not doing the job. Membership follows the `products`
 * permission — the same thing that decides who can change stock in the
 * first place — so a role the owner has customised is respected rather
 * than second-guessed.
 */
export async function stockAlertRecipients() {
  const staff = await User.find({ role: { $in: STAFF_ROLES } }).select("_id role").lean();
  if (!staff.length) return [];

  // Permissions are per role, so they're resolved once per role rather
  // than once per person.
  const roles = [...new Set(staff.map((u) => u.role))];
  const allowed = new Set();
  for (const role of roles) {
    const perms = await getRolePermissions(role);
    if (perms.includes("products")) allowed.add(role);
  }

  return staff.filter((u) => allowed.has(u.role)).map((u) => u._id);
}

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
        alerts.push({ title: "Sold out", soldOut: true, message: `${label} just sold out. Restock it so you don't miss further orders.`, product });
      } else if (after <= threshold && before > threshold) {
        alerts.push({ title: "Running low", soldOut: false, message: `${label} is down to ${after} left (your low-stock threshold is ${threshold}).`, product });
      }
    }
    if (!alerts.length) return 0;

    const recipients = await stockAlertRecipients();
    if (!recipients.length) return alerts.length;

    // One message, however many lines crossed.
    //
    // This used to send one notification per product per admin, so a busy
    // hour that emptied six lines produced six emails to each of three
    // admins. Eighteen emails about the same event is how a shop teaches
    // its own staff to filter inventory alerts into a folder nobody opens.
    const soldOut = alerts.filter((a) => a.soldOut);
    const running = alerts.filter((a) => !a.soldOut);

    const title =
      alerts.length === 1
        ? alerts[0].title
        : soldOut.length && running.length
        ? `${soldOut.length} sold out, ${running.length} running low`
        : soldOut.length
        ? `${soldOut.length} products sold out`
        : `${running.length} products running low`;

    const message =
      alerts.length === 1 ? alerts[0].message : alerts.map((a) => `• ${a.message}`).join("\n");

    for (const user of recipients) {
      await notify({
        user,
        type: "inventory",
        title,
        message,
        // A single product still links straight to it; a digest goes to
        // the list that says what to do about all of them.
        link: alerts.length === 1 ? `/admin/products/${alerts[0].product._id}/edit` : "/admin/products/restock",
        linkLabel: alerts.length === 1 ? "Open product" : "Open restock list",
      });
    }
    return alerts.length;
  } catch (err) {
    console.error("[inventory] low-stock check failed:", err.message);
    return 0;
  }
}
