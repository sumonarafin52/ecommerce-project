// models/Order.js
import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
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
    discountCode: { type: String, default: "" }, // use howa coupon code
    discountAmount: { type: Number, default: 0 }, // koto taka discount peyeche
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    reviewed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", orderSchema);