// models/ShippingMethod.js
import mongoose from "mongoose";

const weightTierSchema = new mongoose.Schema(
  { maxWeightKg: { type: Number, required: true }, rate: { type: Number, required: true } },
  { _id: false }
);

const shippingMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Standard Delivery", "Same-Day", etc.
    description: { type: String, default: "" },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingZone", required: true },
    carrier: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingCarrier", default: null },
    estimatedDelivery: { type: String, default: "" }, // free text, e.g. "2-3 business days"
    rateType: { type: String, enum: ["flat", "weightBased"], default: "flat" },
    flatRate: { type: Number, default: 0 },
    weightTiers: [weightTierSchema], // used when rateType === "weightBased"; last tier's rate applies above its maxWeightKg too
    freeShippingThreshold: { type: Number, default: 0 }, // order subtotal at/above which this method is free; 0 = disabled
    codAllowed: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.ShippingMethod || mongoose.model("ShippingMethod", shippingMethodSchema);
