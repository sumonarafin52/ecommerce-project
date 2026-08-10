// models/Order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    user: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
  // Remove: index: true,  ← Delete this line
},
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    shippingAddress: {
      fullName: {
        type: String,
        required: [true, "Full name is required"],
      },
      phone: {
        type: String,
        required: [true, "Phone number is required"],
      },
      address: {
        type: String,
        required: [true, "Address is required"],
      },
      city: {
        type: String,
        required: [true, "City is required"],
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    paymentId: {
      type: String,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["processing", "shipped", "delivered", "cancelled"],
      default: "processing",
    },
    customerNotes: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.models.Order || mongoose.model("Order", orderSchema);