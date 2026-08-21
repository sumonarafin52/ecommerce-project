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
      // "Today's Deals" and "Best Sellers" used to always render regardless
      // of admin preference — these let them be turned off like any other
      // homepage block, without needing to migrate them into the fully
      // custom `sections` array (they stay in their fixed position, just
      // toggleable).
      showDeals: { type: Boolean, default: true },
      showBestSellers: { type: Boolean, default: true },
    },
    // payment: keyed by gateway id (see lib/paymentGateways.js), e.g.
    //   { sslcommerz: { enabled, mode: "sandbox"|"live", fields: { storeId, storePassword } },
    //     stripe:     { enabled, mode, fields: { publishableKey, secretKey, webhookSecret } }, ... }
    // Left as Mixed on purpose — each gateway has a different credential
    // shape, and this namespace was reserved (not created) in Phase 1
    // specifically so it could be filled in here without a migration.
    payment: { type: mongoose.Schema.Types.Mixed, default: {} },
    // shipping: reserved for the next phase — same reasoning.
    shipping: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Transactional email (order confirmations, status updates, refunds,
    // shipment tracking) — sent via SMTP. smtpPassword is encrypted the
    // same way payment-gateway secrets are (see lib/crypto.js).
    email: {
      enabled: { type: Boolean, default: false },
      fromName: { type: String, default: "" },
      fromEmail: { type: String, default: "" },
      smtpHost: { type: String, default: "" },
      smtpPort: { type: Number, default: 587 },
      smtpSecure: { type: Boolean, default: false }, // true for port 465, false for 587/STARTTLS
      smtpUser: { type: String, default: "" },
      smtpPassword: { type: String, default: "" }, // encrypted at rest
    },
    billing: {
      // Store Billing Information (Settings → Billing → Business Info)
      legalName: { type: String, default: "" },
      billingAddress: { type: String, default: "" },
      country: { type: String, default: "Bangladesh" },
      state: { type: String, default: "" },
      city: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      taxId: { type: String, default: "" }, // Tax/VAT/BIN
      registrationInfo: { type: String, default: "" },
      additionalInfo: { type: String, default: "" },
      // Invoice Settings
      invoice: {
        logo: { type: String, default: "" },
        businessName: { type: String, default: "" },
        address: { type: String, default: "" },
        contactInfo: { type: String, default: "" },
        numberPrefix: { type: String, default: "INV-" },
        numberPadding: { type: Number, default: 5 }, // INV-00001
        dateFormat: { type: String, default: "DD MMM YYYY" },
        currency: { type: String, default: "BDT" },
        taxInfo: { type: String, default: "" },
        footerText: { type: String, default: "Thank you for your business." },
        additionalNotes: { type: String, default: "" },
        paymentInfo: { type: String, default: "" },
      },
      // running counter for invoice numbering — incremented atomically
      // (see lib/invoice.js) so two invoices generated at once never collide
      nextInvoiceNumber: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
