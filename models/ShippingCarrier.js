// models/ShippingCarrier.js
import mongoose from "mongoose";

const shippingCarrierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logo: { type: String, default: "" },
    contactPerson: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    website: { type: String, default: "" },
    address: { type: String, default: "" },
    // {tracking_number} is replaced with the real tracking number when
    // building a link for the customer
    trackingUrlTemplate: { type: String, default: "" },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
    // reserved for a future real API integration — not used yet, but kept
    // here so adding one later doesn't require a schema migration
    api: {
      connected: { type: Boolean, default: false },
      provider: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.models.ShippingCarrier || mongoose.model("ShippingCarrier", shippingCarrierSchema);
