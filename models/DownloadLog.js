// models/DownloadLog.js
//
// An audit record for every download attempt — granted or refused. This is
// what makes abuse visible: one grant being pulled from thirty IPs in an
// hour is a shared/leaked account, and a run of "denied_auth" against
// sequential grant ids is somebody probing for other customers' files.
//
// Deliberately does NOT store the storage URL or the signed token. IP and
// user-agent are kept because they're the only signal that distinguishes
// "customer re-downloading on their new laptop" from "link posted publicly".
import mongoose from "mongoose";

export const DOWNLOAD_OUTCOMES = [
  "served", // bytes delivered
  "denied_auth", // not signed in / not the owner / bad guest token
  "denied_limit", // download quota exhausted
  "denied_expired", // access window passed
  "denied_revoked", // grant revoked by admin
  "denied_token", // signature invalid or token expired
  "denied_rate", // rate limited
  "error", // storage fetch failed
];

const downloadLogSchema = new mongoose.Schema(
  {
    grant: { type: mongoose.Schema.Types.ObjectId, ref: "DownloadGrant", default: null, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String, default: "" },

    fileName: { type: String, default: "" },
    fileVersion: { type: String, default: "" },
    isPreview: { type: Boolean, default: false },

    outcome: { type: String, enum: DOWNLOAD_OUTCOMES, required: true },
    detail: { type: String, default: "" },

    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

downloadLogSchema.index({ at: -1 });
downloadLogSchema.index({ user: 1, at: -1 });
downloadLogSchema.index({ outcome: 1, at: -1 });

export default mongoose.models.DownloadLog || mongoose.model("DownloadLog", downloadLogSchema);
