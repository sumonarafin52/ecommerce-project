// lib/cartRevalidation.js
//
// Checking a shopper's cart against what the shop currently sells.
//
// A cart lives in the browser's localStorage and can sit there for days. In
// that time a price can change, stock can run out, and a product can be
// unpublished — and nothing told the shopper. They would reach checkout
// still seeing the old total, press Place Order, and only then have the
// server recompute: either charging a different amount than the one on
// screen, or refusing the order outright. For a cash-on-delivery shop that
// means a rider turning up asking for money the customer never agreed to.
//
// So the cart is compared against the database before it is shown, and every
// difference is reported per line rather than failing the whole cart — a
// shopper with one sold-out item out of five should keep the other four.
import Product from "@/models/Product";
import { getEffectivePrice } from "@/lib/utils";
import { CART_ISSUES, normaliseCartInput, describeIssue } from "@/lib/cartIssues";

// Re-exported so server code has one import for cart checking, while the
// cart and checkout pages take the wording straight from lib/cartIssues
// (which has no database import, and so no mongoose in the browser bundle).
export { CART_ISSUES, normaliseCartInput, describeIssue };

/**
 * The cart as it really stands now.
 *
 * Returns one entry per line the shopper had, each carrying the current
 * price and stock, the quantity they can actually have, and whatever changed
 * since they added it. Lines that are gone are kept in the list — with
 * `quantity: 0` and an issue — so the page can say which item disappeared
 * instead of it silently vanishing.
 */
export async function revalidateCart(rawItems) {
  const lines = normaliseCartInput(rawItems);
  if (!lines.length) return { items: [], totalAmount: 0, changed: false };

  // One query for the whole cart rather than one per line.
  const products = await Product.find({ _id: { $in: lines.map((l) => l.product) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = lines.map((line) => check(line, byId.get(line.product)));
  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    items,
    totalAmount,
    changed: items.some((i) => i.issues.length > 0),
  };
}

function check(line, product) {
  const base = {
    product: line.product,
    combinationKey: line.combinationKey,
    requestedQuantity: line.quantity,
  };

  // Gone, or no longer on public sale. Draft/private/unlisted are all
  // treated the same way here: an unlisted product is reachable by direct
  // link but is not something a stale cart should quietly keep selling.
  if (!product || product.status !== "public") {
    return {
      ...base,
      name: product?.name || "This item",
      slug: product?.slug || "",
      image: product?.images?.[0] || "",
      price: 0,
      quantity: 0,
      stock: 0,
      issues: [{ type: CART_ISSUES.UNAVAILABLE }],
    };
  }

  const issues = [];

  // A variant that was retired is a different problem from the product
  // being gone — the shopper may well want another size.
  let combo = null;
  if (line.combinationKey) {
    combo = (product.combinations || []).find((c) => c.key === line.combinationKey && c.active);
    if (!combo) {
      return {
        ...base,
        name: product.name,
        slug: product.slug || "",
        image: product.images?.[0] || "",
        price: 0,
        quantity: 0,
        stock: 0,
        issues: [{ type: CART_ISSUES.VARIANT_GONE, variant: line.combinationKey }],
      };
    }
  }

  // A combination price of 0 means "use the base product's price" — the same
  // rule the storefront and the order route use.
  const price = combo?.price > 0 ? combo.price : getEffectivePrice(product);
  const stock = combo ? combo.stock : product.stock;

  let quantity = line.quantity;
  if (stock <= 0) {
    quantity = 0;
    issues.push({ type: CART_ISSUES.OUT_OF_STOCK });
  } else if (stock < line.quantity) {
    quantity = stock;
    issues.push({ type: CART_ISSUES.STOCK_REDUCED, was: line.quantity, now: stock });
  }

  // Only worth mentioning if we know what they were last shown. Compared on
  // whole units of currency so a rounding difference isn't reported as a
  // price change.
  if (line.knownPrice !== null && Math.round(line.knownPrice) !== Math.round(price)) {
    issues.push({ type: CART_ISSUES.PRICE_CHANGED, was: line.knownPrice, now: price });
  }

  return {
    ...base,
    name: combo ? `${product.name} (${combo.key})` : product.name,
    slug: product.slug || "",
    image: combo?.image || product.images?.[0] || "",
    price,
    quantity,
    stock,
    issues,
  };
}
