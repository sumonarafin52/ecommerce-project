// models/StockMovement.js
//
// Why a product's stock number is what it is.
//
// Stock was being changed from six different places — an order placed, an
// order cancelled, a payment that failed, a return accepted, a product
// edited, a product created — and every one of those changes was anonymous.
// A shop owner looking at "3 in stock" had no way to answer the obvious
// question: I had twenty last week, where did they go? When stock did leak
// (and it has, which is why scripts/reconcile-leaked-stock.js exists), the
// only way to find out was to run a repair script afterwards and guess.
//
// Each row is one change: how many, which way, what caused it, and what the
// number was left at. Append-only — a correction is a new row, never an
// edit to an old one, because a ledger you can rewrite answers nothing.
import mongoose from "mongoose";
import { STOCK_REASONS } from "@/lib/stockReasons";

// The reasons and their wording live in a module with no mongoose import,
// so a client component can show them without pulling the database layer
// into the browser bundle. Re-exported here so server-side callers can
// keep importing them from the model.
export { STOCK_REASONS, STOCK_REASON_LABELS } from "@/lib/stockReasons";

const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    // "" for a product without variants — the same key the rest of the
    // system uses, so a variant's history is its own.
    combinationKey: { type: String, default: "" },

    // Signed: negative took stock away, positive gave it back.
    delta: { type: Number, required: true },
    // What the number read after this change. Makes a gap visible: if one
    // row's balance doesn't follow from the last one's, something changed
    // stock without going through the ledger.
    balanceAfter: { type: Number, default: null },

    reason: { type: String, enum: Object.values(STOCK_REASONS), required: true },

    // What caused it, where there is something to point at.
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    // Who did it, for the changes a person made. Null for the ones the
    // system made on its own.
    by: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: "" },
    },
    note: { type: String, default: "", maxlength: 300 },

    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// The two questions this gets asked: "what happened to this product" and
// "what happened in the shop lately".
stockMovementSchema.index({ product: 1, at: -1 });
stockMovementSchema.index({ at: -1 });

export default mongoose.models.StockMovement || mongoose.model("StockMovement", stockMovementSchema);
