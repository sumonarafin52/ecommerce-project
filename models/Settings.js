// models/Settings.js
// Single-document ("singleton") settings store. One row only — always
// queried with Settings.findOne() and created on first write if missing.
// Each top-level key (general, homepage, payment, billing, shipping) is its
// own namespace so future Settings modules (Phase 2/3/4) can be added by
// extending the schema without touching what's already here.
import mongoose from "mongoose";

const heroSlideSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    tag: { type: String, default: "" },
    buttonText: { type: String, default: "Shop Now" },
    buttonLink: { type: String, default: "/products" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

const bannerSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    title: { type: String, default: "" },
    link: { type: String, default: "/products" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

const homeSectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["manual", "category", "topSelling", "newArrivals", "deals", "underPrice"],
      default: "newArrivals",
    },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    maxPrice: { type: Number, default: 0 },
    buttonText: { type: String, default: "See all" },
    buttonLink: { type: String, default: "/products" },
    order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

const settingsSchema = new mongoose.Schema(
  {
    general: {
      storeName: { type: String, default: "SumonMart" },
      storeLogo: { type: String, default: "" },
      storeDescription: { type: String, default: "" },
      storeEmail: { type: String, default: "" },
      storePhone: { type: String, default: "" },
      storeAddress: { type: String, default: "" },
      headerAnnouncement: { type: String, default: "" }, // small top strip text, optional
      footerAbout: { type: String, default: "" },
      footerCopyright: { type: String, default: "" },
      socialLinks: {
        facebook: { type: String, default: "" },
        instagram: { type: String, default: "" },
        youtube: { type: String, default: "" },
        whatsapp: { type: String, default: "" },
      },
    },
    homepage: {
      heroSlides: [heroSlideSchema],
      banners: [bannerSchema],
      sections: [homeSectionSchema],
    },
    // payment: keyed by gateway id (see lib/paymentGateways.js), e.g.
    //   { sslcommerz: { enabled, mode: "sandbox"|"live", fields: { storeId, storePassword } },
    //     stripe:     { enabled, mode, fields: { publishableKey, secretKey, webhookSecret } }, ... }
    // Left as Mixed on purpose — each gateway has a different credential
    // shape, and this namespace was reserved (not created) in Phase 1
    // specifically so it could be filled in here without a migration.
    payment: { type: mongoose.Schema.Types.Mixed, default: {} },
    // billing/shipping: reserved for the next phases — same reasoning.
    billing: { type: mongoose.Schema.Types.Mixed, default: {} },
    shipping: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
