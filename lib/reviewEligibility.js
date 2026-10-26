// lib/reviewEligibility.js
//
// Decides whether a customer is allowed to review a product yet.
//
// The rule used to be "the customer has an order containing this product with
// orderStatus: delivered". That silently excluded every digital product: a
// download-only order is paid and fulfilled the moment payment clears and is
// never marked "delivered", so somebody who bought an ebook, downloaded it,
// and read the whole thing was told to wait until they'd received it.
//
// So "received" is resolved per product:
//   something that ships   → the order has been delivered
//   something you download → the order has been paid
import Order from "@/models/Order";
import Product from "@/models/Product";
import { productRequiresShipping } from "@/lib/shippingRequirement";

/**
 * Returns the order that entitles this customer to review this product, or
 * null. The order is returned (not just a boolean) so the caller can record
 * which purchase the review came from.
 */
export async function findReviewableOrder({ userId, productId }) {
  if (!userId || !productId) return null;

  const product = await Product.findById(productId).select("digitalProduct shippingRequirement").lean();
  if (!product) return null;

  const ships = productRequiresShipping(product);

  if (ships) {
    return Order.findOne({ user: userId, orderStatus: "delivered", "items.product": productId });
  }

  // A download is "received" once it's paid for. Cancelled and refunded
  // orders are excluded — those customers no longer have the product.
  return Order.findOne({
    user: userId,
    paymentStatus: "paid",
    orderStatus: { $nin: ["cancelled", "returned"] },
    "items.product": productId,
  });
}

/** The message to show when a customer isn't eligible yet. */
export function notEligibleMessage(ships) {
  return ships
    ? "You can review this once your order has been delivered."
    : "You can review this once your payment has been confirmed.";
}
