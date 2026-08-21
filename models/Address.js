// models/Address.js
import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "Home", trim: true }, // e.g. Home, Work, Other — free text, not an enum, so customers can name it whatever makes sense to them
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, default: "" },
    state: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

addressSchema.index({ user: 1, isDefault: 1 });

export default mongoose.models.Address || mongoose.model("Address", addressSchema);
