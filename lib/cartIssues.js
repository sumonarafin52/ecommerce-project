// lib/cartIssues.js
//
// The vocabulary for "your cart changed", and how each change is worded.
//
// Separate from lib/cartRevalidation.js, which does the database work, because
// the cart and checkout pages are client components: importing the wording
// from a module that pulls in the Product model drags mongoose into the
// browser bundle, where it fails at runtime with "Cannot read properties of
// undefined (reading 'Product')" and takes the whole page with it.
export const CART_ISSUES = {
  UNAVAILABLE: "unavailable", // deleted, or no longer on public sale
  VARIANT_GONE: "variant_gone", // the size/colour they picked was retired
  OUT_OF_STOCK: "out_of_stock", // nothing left at all
  STOCK_REDUCED: "stock_reduced", // some left, but fewer than they wanted
  PRICE_CHANGED: "price_changed", // costs more or less than when they added it
};

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ""));

/** A whole number of items, within what a person could plausibly buy. */
function saneQuantity(n) {
  const q = Number(n);
  return Number.isInteger(q) && q >= 1 && q <= 500;
}

/**
 * Normalises whatever the browser sent into lines worth looking up.
 *
 * The cart is client-controlled, so everything here is treated as untrusted:
 * ids must look like ids, quantities must be sane. `price` is accepted only
 * so the response can say "was ৳450, now ৳900" — it never takes part in a
 * calculation, which is why a tampered one cannot change what anything costs.
 */
export function normaliseCartInput(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && typeof i === "object" && isObjectId(i.product ?? i._id))
    .map((i) => ({
      product: String(i.product ?? i._id),
      quantity: saneQuantity(i.quantity) ? Number(i.quantity) : 1,
      combinationKey: typeof i.combinationKey === "string" ? i.combinationKey : "",
      knownPrice: Number.isFinite(Number(i.price)) ? Number(i.price) : null,
    }))
    .slice(0, 100); // a cart longer than this is not a shopper
}

/** A short line a shopper can act on, for each kind of change. */
export function describeIssue(issue, formatMoney = (n) => `৳${n}`) {
  switch (issue?.type) {
    case CART_ISSUES.UNAVAILABLE:
      return "This item is no longer available and has been removed.";
    case CART_ISSUES.VARIANT_GONE:
      return `The option you chose${issue.variant ? ` (${issue.variant})` : ""} is no longer sold.`;
    case CART_ISSUES.OUT_OF_STOCK:
      return "This item has sold out.";
    case CART_ISSUES.STOCK_REDUCED:
      return `Only ${issue.now} left — your quantity was reduced from ${issue.was}.`;
    case CART_ISSUES.PRICE_CHANGED:
      return issue.now > issue.was
        ? `The price went up from ${formatMoney(issue.was)} to ${formatMoney(issue.now)}.`
        : `The price dropped from ${formatMoney(issue.was)} to ${formatMoney(issue.now)}.`;
    default:
      return "";
  }
}
