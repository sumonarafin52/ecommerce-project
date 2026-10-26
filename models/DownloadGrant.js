// models/DownloadGrant.js
//
// A customer's *entitlement* to download one digital product from one paid
// order. This is the record that authorises a download — not the order, and
// certainly not a URL the browser happens to hold.
//
// Why a separate collection rather than fields on the order item:
//   * the quota is per purchase, so the counter has to live per
//     (order, product) pair and be incremented atomically under contention;
//   * the policy (limit / expiry / licence) must be frozen at purchase time,
//     so changing a product's download limit later can't retroactively
//     revoke access somebody already paid for;
//   * revoking one customer's access (chargeback, fraud) must not touch the
//     product or anyone else's access.
import mongoose from "mongoose";

const downloadGrantSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, default: "" },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    digitalProduct: { type: mongoose.Schema.Types.ObjectId, ref: "DigitalProduct", required: true },

    // Exactly one of these identifies the owner. Guest checkouts have no
    // user account, so they're bound to the email the order was placed with
    // and reached through the order's guestAccessToken.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String, default: "" },

    // Snapshot — shown in "My Downloads" without needing to load the
    // product, and keeps the record meaningful if the product is deleted.
    productName: { type: String, default: "" },
    version: { type: String, default: "" },

    // Policy frozen at purchase time. 0 = unlimited.
    downloadLimit: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null }, // null = never expires
    downloadCount: { type: Number, default: 0, min: 0 },
    lastDownloadAt: { type: Date, default: null },

    licenseKey: { type: String, default: "" },
    licenseTerms: { type: String, default: "" },

    // Nonces of download tokens already refunded after a failed delivery,
    // so one broken download can't be refunded twice. Capped on write.
    refundedTokens: { type: [String], default: [] },

    revoked: { type: Boolean, default: false },
    revokedReason: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Idempotency: re-running grant creation for an order (duplicate payment
// webhook, admin re-marking an order paid) must not issue a second
// entitlement with a fresh quota.
downloadGrantSchema.index({ order: 1, product: 1 }, { unique: true });
// "My Downloads", newest first
downloadGrantSchema.index({ user: 1, createdAt: -1 });
downloadGrantSchema.index({ guestEmail: 1, createdAt: -1 });

downloadGrantSchema.pre("validate", function (next) {
  if (!this.user && !this.guestEmail) {
    return next(new Error("A download grant needs either a user or a guest email"));
  }
  next();
});

export default mongoose.models.DownloadGrant || mongoose.model("DownloadGrant", downloadGrantSchema);
