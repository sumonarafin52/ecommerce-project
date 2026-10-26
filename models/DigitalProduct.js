// models/DigitalProduct.js
//
// A downloadable asset that can be attached to a Product. One digital
// product may ship several files (the main download, a sample chapter, a
// "source files" bundle, a changelog PDF...), each with its own version.
//
// IMPORTANT: `url` on a file is the private storage location. It is never
// sent to the browser. Customers receive an opaque file index and a
// short-lived signed token instead; the bytes are streamed through
// /api/downloads/file. See lib/digitalDelivery.js.
import mongoose from "mongoose";

const digitalFileSchema = new mongoose.Schema(
  {
    // private storage URL (Cloudinary etc.) — server-side only
    url: { type: String, required: true },
    name: { type: String, default: "" },
    size: { type: Number, default: 0 }, // bytes
    type: { type: String, default: "" }, // pdf / zip / epub...
    version: { type: String, default: "" },
    // A preview/demo file is downloadable by anyone, without a purchase —
    // the sample chapter or watermarked demo. Never counts against a
    // customer's download quota.
    isPreview: { type: Boolean, default: false },
    label: { type: String, default: "" }, // "Main download", "Source files"
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const digitalProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // ---- legacy single-file fields -------------------------------------
    // Kept so every existing DigitalProduct document and the existing admin
    // form keep working untouched. New code should read `files` via
    // resolveFiles() in lib/digitalDelivery.js, which transparently folds
    // these into the same shape.
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    fileType: { type: String, default: "" },

    // ---- multi-file support -------------------------------------------
    files: { type: [digitalFileSchema], default: [] },

    // ---- versioning ----------------------------------------------------
    version: { type: String, default: "" },
    changelog: {
      type: [
        {
          version: { type: String, default: "" },
          notes: { type: String, default: "" },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // ---- licensing -----------------------------------------------------
    // "none"       no key issued
    // "generated"  a unique key is generated per purchase
    // "shared"     one fixed key for all buyers (stored in licenseKey)
    licenseMode: { type: String, enum: ["none", "generated", "shared"], default: "none" },
    licenseKey: { type: String, default: "" }, // only used by "shared"
    licenseTerms: { type: String, default: "" }, // human-readable terms shown to the buyer

    // ---- access policy -------------------------------------------------
    // 0 means unlimited for both of these.
    downloadLimit: { type: Number, default: 0, min: 0 },
    downloadExpiryDays: { type: Number, default: 0, min: 0 },

    active: { type: Boolean, default: true },

    // Lifetime counter across all customers — admin statistic only. The
    // per-customer count that actually enforces the quota lives on
    // DownloadGrant.
    downloads: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// A digital product needs at least one file from somewhere.
digitalProductSchema.pre("validate", function (next) {
  const hasLegacy = !!(this.fileUrl && this.fileUrl.trim());
  const hasFiles = Array.isArray(this.files) && this.files.some((f) => f?.url);
  if (!hasLegacy && !hasFiles) {
    return next(new Error("A digital product needs at least one file"));
  }
  next();
});

export default mongoose.models.DigitalProduct || mongoose.model("DigitalProduct", digitalProductSchema);
