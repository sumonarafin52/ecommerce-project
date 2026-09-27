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
    // Password reset. Only a SHA-256 hash of the token is stored — the raw
    // token exists solely in the emailed link — so a database leak can't be
    // turned into account takeovers. Hidden from queries by default, like
    // the password itself.
    resetTokenHash: { type: String, select: false, default: null },
    resetTokenExpires: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);