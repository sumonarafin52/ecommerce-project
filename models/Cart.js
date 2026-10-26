// models/Cart.js
//
// A signed-in customer's basket, kept on the server.
//
// The cart used to live only in the browser's localStorage, which has two
// costs a shop pays in money rather than in bugs: a basket built on a phone
// is simply gone on a laptop, and a basket that is abandoned is invisible —
// nobody can be reminded of something nobody recorded.
//
// Only what the shopper chose is stored: which product, which variant, how
// many. Prices and availability are deliberately NOT stored, because a
// stored price goes stale the moment the shop changes one, and the cart is
// re-checked against the catalogue (lib/cartRevalidation.js) every time it
// is read. Guests have no row here at all — there is nobody to tie it to,
// and a cart row keyed on a cookie would be a tracking record with no
// shopper-visible purpose.
import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // "" for a product sold without variants — the same key the browser
    // store uses, so a line survives the round trip intact.
    combinationKey: { type: String, default: "", trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1, max: 500 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },

    // When the shopper last changed the basket. Distinct from updatedAt,
    // which also moves when staff send a reminder — and a reminder must
    // never look like the customer coming back.
    lastActivityAt: { type: Date, default: Date.now, index: true },

    // Recovery. `reminderCount` is what stops a shop from nagging: the
    // sender checks it before every send, so there is no way to loop.
    reminderSentAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0 },

    // What the basket held when the reminder went out. Kept because a
    // recovered basket is emptied — without this, every successful recovery
    // would show in the admin list as a row worth nothing, and "what did
    // reminders bring in?" would have no answer. It is a record of that
    // moment, not a live price, and the admin page labels it as such.
    reminderValue: { type: Number, default: 0 },
    reminderItemCount: { type: Number, default: 0 },

    // A recovery is NOT recorded here. This row is the live basket and
    // keeps changing — a customer who buys and then shops again would
    // overwrite the record of their own recovery, and the shop's figures
    // would fall as its customers came back. See models/CartRecovery.js.
  },
  { timestamps: true }
);

// The admin list is "abandoned, oldest first" and the reminder sweep asks
// the same question, so both are served by one index rather than a scan.
cartSchema.index({ lastActivityAt: -1, reminderSentAt: 1 });

// Older documents may still carry the recoveredAt/recoveredOrder fields
// this model used to define. Mongoose ignores them, and they do no harm;
// strict mode means nothing new is written to them.

export default mongoose.models.Cart || mongoose.model("Cart", cartSchema);
