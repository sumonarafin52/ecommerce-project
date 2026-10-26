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
    // Courier API integration. `provider` names an adapter in
    // lib/carriers/; "manual" (or connected:false) means tracking numbers
    // are entered by hand, which is the normal case for most couriers.
    api: {
      connected: { type: Boolean, default: false },
      provider: { type: String, default: "manual" },
      // Per-provider credentials. Secret ones are encrypted at rest, the
      // same way payment gateway credentials are, and never leave the
      // server — the admin UI only learns whether one is set.
      credentials: { type: mongoose.Schema.Types.Mixed, default: {} },
      lastTestedAt: { type: Date, default: null },
      lastTestOk: { type: Boolean, default: null },
      lastTestMessage: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.models.ShippingCarrier || mongoose.model("ShippingCarrier", shippingCarrierSchema);
