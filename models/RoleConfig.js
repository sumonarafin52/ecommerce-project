// models/RoleConfig.js
import mongoose from "mongoose";

// Admin jokhon kono role er access customize korben, tokhon oi role er
// final permission list ekhane save hobe. Na thakle lib/rbac.js er defaults lagbe.
const roleConfigSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["admin", "editor", "order_processing", "support"],
      unique: true,
      required: true,
    },
    permissions: [{ type: String }], // jemon: ["dashboard", "products", "orders"]
  },
  { timestamps: true }
);

export default mongoose.models.RoleConfig || mongoose.model("RoleConfig", roleConfigSchema);