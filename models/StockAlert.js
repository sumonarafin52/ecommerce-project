// models/StockAlert.js
import mongoose from "mongoose";

const stockAlertSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // "" for products without variants; otherwise the specific
    // combination the customer wants (e.g. "M / Black")
    combinationKey: { type: String, default: "" },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// one subscription per customer per product/variant
stockAlertSchema.index({ user: 1, product: 1, combinationKey: 1 }, { unique: true });
// the restock sweep looks up pending alerts for a product
stockAlertSchema.index({ product: 1, notifiedAt: 1 });

export default mongoose.models.StockAlert || mongoose.model("StockAlert", stockAlertSchema);
