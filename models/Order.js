// models/Order.js
import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  sku: { type: String, default: "" }, // snapshot at order time, for invoices
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  // matches Product.combinations[].key (e.g. "S / Black") when this line
  // is a specific variant — empty string for products without variants
  combinationKey: { type: String, default: "" },
});

const shipmentEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      // "cancelled" covers a courier cancelling the consignment itself, which
      // is distinct from the order being cancelled — the parcel can be called
      // back while the order stands.
      enum: ["confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned", "cancelled"],
      required: true,
    },
    note: { type: String, default: "" },
    location: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// A single fulfillment/shipment covering some or all of the order's items —
// supports partial fulfillment (e.g. 2 shipments for one order, each with
// its own carrier/tracking). Separate from the legacy singular `shipment`
// field below, which stays untouched for backward compatibility with the
// public order-tracking page.
const fulfillmentSchema = new mongoose.Schema(
  {
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    carrier: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingCarrier", default: null },
    method: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingMethod", default: null },
    trackingNumber: { type: String, default: "" },
    // Set when this parcel was booked through a courier's API, so a later
    // status fetch can ask about the right consignment. Empty for a tracking
    // number typed in by hand, which is still the common case.
    consignmentId: { type: String, default: "" },
    bookedWith: { type: String, default: "" }, // the carrier adapter id used
    bookedAt: { type: Date, default: null },
    lastStatusCheckAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned", "cancelled"],
      default: "pending",
    },
    estimatedDelivery: { type: Date, default: null },
    notes: { type: String, default: "" },
    timeline: [shipmentEventSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Chronological activity log for the order-detail page — who did what and
// when. Written by the various order API routes; not directly editable.
const activityEntrySchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // e.g. "status_changed", "shipment_created", "note", "refund"
    message: { type: String, required: true },
    by: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: "System" },
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Used by the shippingAddress sub-paths below. Declared as a named function
// so it reads clearly at both call sites.
function requiredWhenShipping() {
  return this.requiresShipping !== false;
}

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    // Whether this order has anything to deliver. Computed server-side from
    // the products at order creation, never taken from the client. A
    // digital-only order skips the address requirement, the shipping charge
    // and the courier/tracking workflow entirely.
    requiresShipping: { type: Boolean, default: true },
    invoiceNumber: { type: String, default: "" }, // assigned on first invoice view, see lib/invoice.js
    // Optional: guest orders have no account. Exactly one of `user` or
    // `guestEmail` is always set (enforced in the pre-validate hook below).
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String, default: "", lowercase: true, trim: true },
    // lets a guest open their own confirmation page without an account;
    // random, so one order id can't be used to read another
    guestAccessToken: { type: String, default: "", select: false },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      // Required only for orders that actually ship. A download-only order
      // must not be forced to invent a street address — see
      // lib/shippingRequirement.js and the `requiresShipping` field below.
      // (`this` here is the order document, since shippingAddress is an
      // inline nested object rather than a separate sub-schema.)
      address: { type: String, required: requiredWhenShipping },
      city: { type: String, required: requiredWhenShipping },
      // Optional — captured by the country/state picker on checkout.
      // "state" holds whatever the selected country calls its
      // state/province/district; kept as free text since names/levels
      // vary by country rather than tying this to a specific dataset.
      country: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
    },
    paymentMethod: { type: String, enum: ["sslcommerz", "bkash", "cod"], default: "sslcommerz" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    // set only after a server-to-server SSLCommerz validation API check
    // succeeds — an audit trail distinguishing verified payments from the
    // raw (forgeable) postback status
    paymentVerifiedAt: { type: Date },
    // Captured from SSLCommerz's validation response when payment is
    // verified — bank_tran_id is what the refund API needs to identify
    // which transaction to refund.
    bankTranId: { type: String, default: "" },
    sslcommerzValId: { type: String, default: "" },
    // The provider's own id for this payment attempt (bKash's paymentID,
    // and whatever its equivalent is for providers added later). Recorded
    // when the payment is created, so a redirect arriving in the customer's
    // browser can be matched to an order WITHOUT trusting anything in the
    // URL — the customer can edit that; they cannot edit this.
    paymentProviderRef: { type: String, default: "", index: true },
    // Set once an order's reserved inventory has been returned to stock —
    // currently when an online payment fails or is cancelled. Guards against
    // double-restoring the same order's stock, and blocks re-initiating
    // payment on an order that no longer holds its inventory.
    stockReleased: { type: Boolean, default: false },
    orderStatus: {
      type: String,
      enum: ["pending", "processing", "on_hold", "shipped", "delivered", "cancelled", "returned"],
      default: "processing",
    },
    // Set only while orderStatus === "on_hold" — remembers the stage to
    // restore to when the hold is released (see lib/orderStatus.js
    // putOnHold/releaseHold). Replaces the old standalone `onHold` boolean,
    // which lived alongside orderStatus instead of inside its pipeline and
    // could drift out of sync with it.
    previousStatus: { type: String, default: undefined },
    holdReason: { type: String, default: "" },
    totalAmount: { type: Number, required: true }, // final amount (discount applied)
    baseAmount: { type: Number, default: 0 }, // discount er ager amount
    shippingCost: { type: Number, default: 0 },
    shippingMethodName: { type: String, default: "" }, // snapshot — survives even if the method is edited/deleted later
    discountCode: { type: String, default: "" }, // use howa coupon code
    discountAmount: { type: Number, default: 0 }, // koto taka discount peyeche

    // Tax, worked out server-side at order time and frozen here. Stored as
    // a snapshot rather than recomputed on display, because rates change and
    // an old invoice must keep showing the tax that was actually charged.
    taxTotal: { type: Number, default: 0 },
    taxLines: {
      type: [
        {
          name: { type: String, default: "" },
          rate: { type: Number, default: 0 },
          amount: { type: Number, default: 0 },
          appliesTo: { type: String, default: "all" },
          compound: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    taxZoneName: { type: String, default: "" },
    // Whether taxTotal is already inside totalAmount (inclusive pricing) or
    // was added on top. Needed to render the invoice correctly years later.
    pricesIncludeTax: { type: Boolean, default: false },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    reviewed: { type: Boolean, default: false },
    refund: {
      amount: { type: Number, default: 0 }, // most recent / total refunded so far
      reason: { type: String, default: "" },
      refundedAt: { type: Date, default: null },
      refundedBy: { type: String, default: "" }, // staff name snapshot
      // "manual"          — staff recorded a refund done outside the app
      //                     (e.g. COD cash return, or gateway dashboard)
      // "gateway_pending" — SSLCommerz refund initiated, awaiting settlement
      // "gateway_completed" — SSLCommerz confirmed the refund
      // "gateway_failed"  — SSLCommerz rejected the refund request
      method: { type: String, enum: ["manual", "gateway_pending", "gateway_completed", "gateway_failed"], default: "manual" },
      gatewayRefundRefId: { type: String, default: "" }, // refund_ref_id from SSLCommerz
      gatewayMessage: { type: String, default: "" }, // raw status message from the gateway, for support/debugging
    },
    // Every refund attempt (manual or gateway), oldest first — the `refund`
    // field above always mirrors the most recent entry here for screens
    // that only need the latest state.
    refundHistory: [
      {
        amount: { type: Number, required: true },
        reason: { type: String, default: "" },
        method: { type: String, enum: ["manual", "gateway_pending", "gateway_completed", "gateway_failed"], default: "manual" },
        gatewayRefundRefId: { type: String, default: "" },
        gatewayMessage: { type: String, default: "" },
        by: { type: String, default: "" },
        at: { type: Date, default: Date.now },
      },
    ],
    // detailed shipment tracking — separate from the existing orderStatus
    // field above (which several filters/exports/stock-restore logic
    // already depend on) so nothing that reads orderStatus needs to change.
    // The admin UI keeps the two in sync for the statuses they share.
    // Kept as-is (singular) for the simple/common single-shipment case and
    // the public tracking page; `fulfillments` below is the new array used
    // for partial/multi-shipment orders on the Order Details page.
    shipment: {
      carrier: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingCarrier", default: null },
      method: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingMethod", default: null },
      trackingNumber: { type: String, default: "" },
      estimatedDelivery: { type: Date, default: null },
      notes: { type: String, default: "" },
      timeline: [shipmentEventSchema],
    },
    fulfillments: [fulfillmentSchema],
    activity: [activityEntrySchema],
  },
  { timestamps: true }
);

// Orders are queried constantly and had no indexes beyond _id, so every
// one of these was a full collection scan.
//
// customer order history, and the admin list sorted newest-first
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
// dashboard stats and the status tabs in order management
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
// the draft-reuse lookup on checkout (user + pending + method + recency)
orderSchema.index({ user: 1, paymentStatus: 1, paymentMethod: 1, createdAt: -1 });
// public order tracking looks orders up by number
// (no orderNumber index here — `unique: true` on the field already creates
// one, and declaring it twice made Mongoose warn about a duplicate index on
// every cold start.)
// the auto-fulfil sweep that runs on every order list load
orderSchema.index({ orderStatus: 1, shippedAt: 1 });

// An order must belong to someone: a registered customer or a guest email.
orderSchema.pre("validate", function (next) {
  if (!this.user && !this.guestEmail) {
    return next(new Error("An order needs either a customer account or a guest email"));
  }
  next();
});

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
