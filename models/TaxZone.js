// models/TaxZone.js
//
// A geographic area that shares a set of tax rates — "Bangladesh", "EU",
// "California", "Rest of world".
//
// Zones are matched most-specific-first: a zone naming both a country and a
// state beats one naming only the country, which beats a catch-all with no
// countries listed. That ordering is what lets a store run a national rate
// plus a handful of regional exceptions without the two fighting.
import mongoose from "mongoose";

const taxZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // Country names as the checkout's country picker writes them (it stores
    // the display name, not an ISO code). Empty means "anywhere" — that's
    // how a fallback zone is expressed.
    countries: { type: [String], default: [] },

    // Optional narrowing within those countries: states, provinces, or the
    // districts a Bangladesh address uses. Empty means the whole country.
    states: { type: [String], default: [] },

    // Manual tie-breaker for two zones of equal specificity. Higher wins.
    priority: { type: Number, default: 0 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

taxZoneSchema.index({ active: 1 });

export default mongoose.models.TaxZone || mongoose.model("TaxZone", taxZoneSchema);
