// models/ReturnRequest.js
import mongoose from "mongoose";

export const RETURN_WINDOW_DAYS = 7; // matches the "7-day returns" promise on product pages

export const RETURN_REASONS = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item sent",
  not_as_described: "Not as described",
  size_fit: "Size or fit issue",
  changed_mind: "Changed my mind",
  other: "Other",
};

// requested → approved | rejected
// approved  → received   (item back in hand; stock restored)
// received  → refunded   (money returned via the order's refund flow)
export const RETURN_TRANSITIONS = {
  requested: ["approved", "rejected"],
  approved: ["received", "rejected"],
  received: ["refunded"],
  rejected: [],
  refunded: [],
};

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    combinationKey: { type: String, default: "" },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true }, // unit price paid, for the refund amount
  },
  { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, default: "" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [returnItemSchema], validate: (v) => v.length > 0 },
    reason: { type: String, enum: Object.keys(RETURN_REASONS), required: true },
    details: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: Object.keys(RETURN_TRANSITIONS), default: "requested" },
    adminNote: { type: String, default: "", maxlength: 1000 },
    refundAmount: { type: Number, default: 0 },
    stockRestored: { type: Boolean, default: false },
    history: [
      {
        status: String,
        note: String,
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ order: 1 });
returnRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.ReturnRequest || mongoose.model("ReturnRequest", returnRequestSchema);
