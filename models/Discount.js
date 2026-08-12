// models/Discount.js
import mongoose from "mongoose";

const discountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // jemon: EID20
    description: { type: String, default: "" },
    type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    value: { type: Number, required: true }, // percentage (1-100) othoba fixed taka (৳)
    // kodok khane apply hobe:
    // all      = puro cart
    // category = sudhu oi category er products
    // product  = sudhu oi product
    // customer = sudhu oi customer er order
    scope: { type: String, enum: ["all", "category", "product", "customer"], default: "all" },
    target: { type: String, default: "" }, // category name / product id / customer id
    minAmount: { type: Number, default: 0 }, // minimum order total
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited use
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date }, // na dile kono expiry nai
  },
  { timestamps: true }
);

export default mongoose.models.Discount || mongoose.model("Discount", discountSchema);