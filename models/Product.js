// models/Product.js
import mongoose from "mongoose";

// ===== VARIANT OPTION (custom type + values) =====
const variantOptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Size / Color / Material / custom
    values: [{ type: String, trim: true }], // ["S","M","L"]
  },
  { _id: false }
);

// ===== VARIANT COMBINATION (per-combination management) =====
const variantCombinationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // "S / Black"
    options: { type: Map, of: String }, // { Size: "S", Color: "Black" }
    price: { type: Number, default: 0 }, // 0 = base price use hobe
    comparePrice: { type: Number, default: 0 },
    sku: { type: String, default: "" },
    stock: { type: Number, default: 0 },
    image: { type: String, default: "" }, // variant select ei photo dekhabe
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, default: "", trim: true },
    brand: { type: String, default: "", trim: true },
    sku: { type: String, default: "", trim: true },
    weight: { type: Number, default: 0 }, // kg — used for weight-based shipping rate calculation
    tags: [{ type: String, trim: true }],
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: 0 },
    images: [{ type: String }],
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ["public", "private", "draft", "unlisted"], default: "public" },
    isActive: { type: Boolean, default: true }, // legacy field — status er sathe auto-sync
    options: [variantOptionSchema],
    combinations: [variantCombinationSchema],
    digitalProduct: { type: mongoose.Schema.Types.ObjectId, ref: "DigitalProduct", default: null },
    ratingAvg: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// status <-> isActive sync (purono storefront query gulo safe rakhbe)
productSchema.pre("save", function (next) {
  this.isActive = this.status === "public";
  next();
});

// Every list/search query filters by status first (public-only for
// customers, or an explicit status for admin) — these compound indexes
// cover the common combinations so MongoDB doesn't collection-scan.
productSchema.index({ status: 1, category: 1 });
productSchema.index({ status: 1, brand: 1 });
productSchema.index({ status: 1, price: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, ratingAvg: -1 });
productSchema.index({ status: 1, numReviews: -1 });
productSchema.index({ sku: 1 });
productSchema.index({ featured: 1, status: 1 });

export default mongoose.models.Product || mongoose.model("Product", productSchema);