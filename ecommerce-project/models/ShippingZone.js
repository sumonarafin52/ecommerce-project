// models/ShippingZone.js
import mongoose from "mongoose";

const shippingZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Dhaka", "Outside Dhaka", "International"
    regions: [{ type: String, trim: true }], // free-text districts/countries covered by this zone
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.ShippingZone || mongoose.model("ShippingZone", shippingZoneSchema);
