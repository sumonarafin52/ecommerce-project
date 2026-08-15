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
    orderStatus: { type: String, enum: ["processing", "shipped", "delivered", "cancelled"], default: "processing" },
    totalAmount: { type: Number, required: true }, // final amount (discount applied)
    baseAmount: { type: Number, default: 0 }, // discount er ager amount
    shippingCost: { type: Number, default: 0 },
    shippingMethodName: { type: String, default: "" }, // snapshot — survives even if the method is edited/deleted later
    discountCode: { type: String, default: "" }, // use howa coupon code
    discountAmount: { type: Number, default: 0 }, // koto taka discount peyeche
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    reviewed: { type: Boolean, default: false },
    // detailed shipment tracking — separate from the existing orderStatus
    // field above (which several filters/exports/stock-restore logic
    // already depend on) so nothing that reads orderStatus needs to change.
    // The admin UI keeps the two in sync for the statuses they share.
    shipment: {
      carrier: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingCarrier", default: null },
      method: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingMethod", default: null },
      trackingNumber: { type: String, default: "" },
      estimatedDelivery: { type: Date, default: null },
      notes: { type: String, default: "" },
      timeline: [shipmentEventSchema],
    },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", orderSchema);