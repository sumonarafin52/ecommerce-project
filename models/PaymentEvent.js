// models/PaymentEvent.js
//
// A ledger of payment callbacks the store has already acted on.
//
// Payment gateways retry. SSLCommerz re-posts an IPN if it doesn't get a
// clean response; Stripe redelivers for up to three days; a customer can
// refresh the return URL. Without a record of what's been handled, the same
// event gets processed twice — and "processed twice" for a payment means
// double-counted revenue, a second set of download entitlements, duplicate
// confirmation emails, or a refund issued twice.
//
// The unique index on (provider, eventId) is what makes handling idempotent:
// the insert either succeeds (this event is new, go ahead) or fails with a
// duplicate-key error (already handled, do nothing). That decision is atomic,
// so two callbacks arriving at the same instant can't both win.
import mongoose from "mongoose";

const paymentEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },

    // The gateway's own identifier for this event. Each adapter decides what
    // that is — a validation id, a webhook event id, or a composite built
    // from the fields that make the event unique.
    eventId: { type: String, required: true },

    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },

    // What the event said, and what we did about it. Kept for support and
    // for reconciling against the gateway's own dashboard.
    status: { type: String, default: "" },
    outcome: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "" },
    transactionId: { type: String, default: "" },

    // Never the full payload: gateway callbacks carry card fragments and
    // customer details that don't belong in a log. Adapters pass a short
    // summary instead.
    note: { type: String, default: "" },

    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

paymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
paymentEventSchema.index({ order: 1, at: -1 });
paymentEventSchema.index({ at: -1 });

export default mongoose.models.PaymentEvent || mongoose.model("PaymentEvent", paymentEventSchema);
