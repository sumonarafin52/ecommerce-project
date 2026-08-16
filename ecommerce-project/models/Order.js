// models/Order.js
import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  sku: { type: String, default: "" }, // snapshot at order time, for invoices
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
});

const shipmentEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned"],
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
    status: {
      type: String,
      enum: ["pending", "shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned"],
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

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    invoiceNumber: { type: String, default: "" }, // assigned on first invoice view, see lib/invoice.js
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
    },
    paymentMethod: { type: String, enum: ["sslcommerz", "cod"], default: "sslcommerz" },
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

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
