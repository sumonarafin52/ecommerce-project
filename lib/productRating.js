// lib/productRating.js
import mongoose from "mongoose";
import Review from "@/models/Review";
import Product from "@/models/Product";

/**
 * Recomputes a product's average rating and review count.
 *
 * Counts PUBLISHED reviews only — hiding an abusive or mistaken review has
 * to remove its influence on the score too, otherwise a hidden 1-star would
 * keep dragging the product down invisibly.
 *
 * Resets to 0 when nothing is left, so the last review being hidden doesn't
 * leave a stale average behind.
 */
export async function recalcProductRating(productId) {
  const id = typeof productId === "string" ? new mongoose.Types.ObjectId(productId) : productId;
  const stats = await Review.aggregate([
    { $match: { product: id, status: { $ne: "hidden" } } },
    { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const next = stats.length
    ? { ratingAvg: Math.round(stats[0].avg * 10) / 10, numReviews: stats[0].count }
    : { ratingAvg: 0, numReviews: 0 };
  await Product.findByIdAndUpdate(id, next);
  return next;
}
