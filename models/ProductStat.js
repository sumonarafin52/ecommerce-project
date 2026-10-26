// models/ProductStat.js
//
// How often a product was looked at, and how often it reached a basket.
//
// Counters only. There is no row per visitor, no identifier, no IP and no
// cookie beyond the one the shop already sets: just "this product, this
// day, this many". A shop owner needs to know that forty people looked at
// a jacket and none bought it; nobody needs to know which forty.
//
// Purchases are deliberately NOT stored here. They already exist in the
// order collection, which is the financial record, and a second copy would
// be a second number to disagree with it. The performance report joins the
// two at read time.
//
// `day` is a calendar date in the shop's own timezone (lib/storeTime.js),
// so a day here lines up with a day on the reports page rather than with
// UTC.
import mongoose from "mongoose";

const productStatSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    day: { type: String, required: true }, // "2026-10-15", shop time

    views: { type: Number, default: 0 },
    addToCart: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One row per product per day — the counters are incremented into it with
// an upsert, so two simultaneous visitors can't create duplicate rows.
productStatSchema.index({ product: 1, day: 1 }, { unique: true });

// The report asks "all products over this date range", which this serves
// without a collection scan.
productStatSchema.index({ day: 1, product: 1 });

export default mongoose.models.ProductStat || mongoose.model("ProductStat", productStatSchema);
