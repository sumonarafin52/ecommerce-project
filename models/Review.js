// models/Review.js
import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" }, // the order this review came from
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: "" },

    // Recorded at write time rather than inferred later: the order could be
    // cancelled or refunded afterwards, and that doesn't retroactively mean
    // the reviewer never bought the product.
    verifiedPurchase: { type: Boolean, default: true },

    // published = visible on the storefront; hidden = kept for the record
    // but not shown and not counted in the product's rating.
    status: { type: String, enum: ["published", "hidden"], default: "published" },

    // optional public reply from the store, shown under the review
    reply: { type: String, default: "", maxlength: 1000 },
    repliedBy: { type: String, default: "" },
    repliedAt: { type: Date, default: null },

    // "Was this helpful?" — stored as the set of voters rather than a bare
    // counter, so one person can't inflate a review by clicking repeatedly,
    // and so a vote can be taken back.
    helpfulVotes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },

    // Customer reports. Kept with who and why so an admin can judge, instead
    // of auto-hiding on a count — which would let a handful of accounts bury
    // an honest bad review.
    reports: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          reason: { type: String, enum: ["spam", "offensive", "off_topic", "fake", "other"], default: "other" },
          note: { type: String, default: "", maxlength: 500 },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // "reviewed" here means an admin has looked at the reports and decided —
    // it does not mean the reports were removed.
    reportsResolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// one review per product per customer
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
// the storefront's default sort: most helpful first
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model("Review", reviewSchema);
