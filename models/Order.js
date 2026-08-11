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
    // sslcommerz = advance payment, cod = receive er por payment (custom paid)
    paymentMethod: { type: String, enum: ["sslcommerz", "cod"], default: "sslcommerz" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    orderStatus: { type: String, enum: ["processing", "shipped", "delivered", "cancelled"], default: "processing" },
    totalAmount: { type: Number, required: true },
    shippedAt: { type: Date }, // admin ship korle set hobe
    deliveredAt: { type: Date }, // customer confirm / 30 din auto-fulfill
    reviewed: { type: Boolean, default: false }, // customer review dile true
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", orderSchema);