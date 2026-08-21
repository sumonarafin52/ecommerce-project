// models/PaymentPreference.js
import mongoose from "mongoose";

const paymentPreferenceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // constrained to methods actually offered at checkout (see
    // lib/paymentGateways.js checkoutLive) — no point defaulting to
    // something that won't show up there
    defaultMethod: { type: String, enum: ["cod", "sslcommerz"], default: "cod" },
    // Reference only — pre-fills nothing that charges anything. SSLCommerz
    // collects the actual wallet PIN/OTP itself on its hosted page; this
    // just saves the customer re-typing their own number as a reminder.
    walletProvider: { type: String, enum: ["", "bkash", "nagad", "rocket"], default: "" },
    walletNumber: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.PaymentPreference || mongoose.model("PaymentPreference", paymentPreferenceSchema);
