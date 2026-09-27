// models/ProductQuestion.js
import mongoose from "mongoose";

const productQuestionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    askerName: { type: String, default: "" }, // shown publicly as a first name only
    question: { type: String, required: true, trim: true, maxlength: 500 },
    answer: { type: String, default: "", maxlength: 2000 },
    answeredBy: { type: String, default: "" },
    answeredAt: { type: Date, default: null },
    // pending   — waiting for staff; visible only to the person who asked
    // published — answered and shown on the product page
    // hidden    — rejected (spam, abuse, off-topic); never shown
    status: { type: String, enum: ["pending", "published", "hidden"], default: "pending" },
  },
  { timestamps: true }
);

productQuestionSchema.index({ product: 1, status: 1, answeredAt: -1 });
productQuestionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.ProductQuestion || mongoose.model("ProductQuestion", productQuestionSchema);
