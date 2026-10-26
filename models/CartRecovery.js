// models/CartRecovery.js
//
// One row per basket that was reminded and then actually bought.
//
// This started life as two fields on the Cart document, which was wrong in
// a way that only showed up when a real order was placed and the customer
// carried on shopping: a Cart row is the customer's LIVE basket, so filling
// it again overwrote the record of the recovery — and the shop's "recovered"
// figure went down as its customers came back. A record of something that
// happened cannot live in a row that keeps changing.
//
// So the episode is written here, once, and never touched again. The live
// basket is free to be emptied, refilled and reminded about as often as the
// customer likes without disturbing the history.
import mongoose from "mongoose";

const cartRecoverySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },

    // What the basket was worth when the reminder went out, and when that
    // was — so "did reminders bring anything in?" is answered in money and
    // in orders, not in opens and clicks the shop cannot see.
    value: { type: Number, default: 0 },
    itemCount: { type: Number, default: 0 },
    remindedAt: { type: Date, default: null },
    recoveredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// One order can only ever recover one basket, so a retry or a double-submit
// cannot inflate the figures.
cartRecoverySchema.index({ order: 1 }, { unique: true });

export default mongoose.models.CartRecovery || mongoose.model("CartRecovery", cartRecoverySchema);
