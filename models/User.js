// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // password is excluded from every query by default (select: false) — a
    // future query anywhere in the app that forgets to restrict fields can
    // no longer accidentally leak the password hash. Call
    // `.select("+password")` explicitly where it's actually needed (login).
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["customer", "admin", "editor", "order_processing", "support"],
      default: "customer", // signup e sobai customer hisebe ashbe
    },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);