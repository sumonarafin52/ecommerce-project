// lib/shippingRequirement.js
//
// Decides, server-side, whether an order needs shipping at all.
//
// A cart of nothing but downloads should not ask the customer for a delivery
// address, should not be blocked because no courier covers their district,
// and should not have a shipping charge added. Equally, this cannot be a
// client-side decision: a browser claiming "no shipping needed" for a cart
// of physical goods would be claiming free delivery.
//
// So the storefront uses this only to decide what to *show*, and the order
// route calls it again to decide what to *charge* and what to require.

/** One product's requirement, resolving "auto" against its digital file. */
export function productRequiresShipping(product) {
  if (!product) return true; // unknown product: assume physical, never under-charge
  const mode = product.shippingRequirement || "auto";
  if (mode === "always") return true;
  if (mode === "never") return false;
  return !product.digitalProduct; // auto
}

/**
 * Whether an order containing these products needs shipping.
 * Mixed carts (an ebook plus a mug) DO need shipping — the physical half has
 * to get there — and the digital half still delivers immediately on payment.
 *
 * `products` are the loaded product documents for the order's items.
 */
export function orderRequiresShipping(products) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return true; // nothing resolved: fall back to physical
  return list.some((p) => productRequiresShipping(p));
}

/** Splits an order's loaded products into what ships and what downloads. */
export function splitFulfillment(products) {
  const physical = [];
  const digital = [];
  for (const p of Array.isArray(products) ? products : []) {
    if (productRequiresShipping(p)) physical.push(p);
    if (p?.digitalProduct) digital.push(p);
  }
  return { physical, digital, isDigitalOnly: physical.length === 0 && digital.length > 0 };
}
