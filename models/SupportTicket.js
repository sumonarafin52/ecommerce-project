// models/SupportTicket.js
import mongoose from "mongoose";

export const TICKET_CATEGORIES = {
  order: "Order or delivery",
  payment: "Payment or refund",
  product: "Product question",
  account: "My account",
  other: "Something else",
};

const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ["customer", "staff"], required: true },
    authorName: { type: String, default: "" },
    body: { type: String, required: true, maxlength: 5000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    // optional — guests can contact support too
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: "", maxlength: 30 },
    category: { type: String, enum: Object.keys(TICKET_CATEGORIES), required: true },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    orderNumber: { type: String, default: "", maxlength: 40 },
    status: { type: String, enum: ["open", "answered", "closed"], default: "open" },
    messages: [messageSchema],
  },
  { timestamps: true }
);

supportTicketSchema.index({ status: 1, updatedAt: -1 });
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ email: 1, createdAt: -1 });

export default mongoose.models.SupportTicket || mongoose.model("SupportTicket", supportTicketSchema);
