// models/TaxRate.js
//
// One tax that applies within a zone — "VAT 15%", "GST 5%", "State sales
// tax 7.25%". A zone can carry several, which is normal: a US address may
// owe both a state and a city rate, and some countries levy a surcharge on
// top of the base tax.
import mongoose from "mongoose";

const taxRateSchema = new mongoose.Schema(
  {
    zone: { type: mongoose.Schema.Types.ObjectId, ref: "TaxZone", required: true, index: true },

    // Shown to the customer on the invoice, so it should be the name they'd
    // recognise ("VAT", not "rate_1").
    name: { type: String, required: true, trim: true },

    // Percent, not a fraction: 15 means 15%. Stored with decimals because
    // real rates are not all whole numbers (7.25%, 19.6%).
    rate: { type: Number, required: true, min: 0, max: 100 },

    // Digital goods are frequently taxed differently from physical ones —
    // different rate, or taxed at the buyer's location rather than the
    // seller's. Keeping this per-rate avoids hard-coding one country's rules.
    appliesTo: { type: String, enum: ["all", "physical", "digital"], default: "all" },

    // Whether delivery is taxed. Varies by jurisdiction, so it's a setting
    // rather than an assumption.
    taxShipping: { type: Boolean, default: true },

    // A compound rate is charged on the amount PLUS the non-compound taxes
    // already applied, rather than on the amount alone.
    compound: { type: Boolean, default: false },

    // Order of application. Compound rates are always applied after
    // non-compound ones regardless of this.
    priority: { type: Number, default: 0 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

taxRateSchema.index({ zone: 1, active: 1 });

export default mongoose.models.TaxRate || mongoose.model("TaxRate", taxRateSchema);
