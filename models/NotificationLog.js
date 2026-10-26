// models/NotificationLog.js
//
// What the store actually sent, and whether it arrived.
//
// Before this there was no way to answer "did the customer get told their
// order shipped?" — emails were fire-and-forget and a failure only ever
// reached the server console. That's the first question support asks, and
// with SMS it's also the question an unexpected bill raises.
import mongoose from "mongoose";

const notificationLogSchema = new mongoose.Schema(
  {
    event: { type: String, required: true }, // an id from lib/notifications/events.js
    channel: { type: String, enum: ["inApp", "email", "sms"], required: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // The address or number it went to. Kept because support needs to see
    // which one was used when a customer says they got nothing.
    recipient: { type: String, default: "" },

    title: { type: String, default: "" },
    sent: { type: Boolean, default: false },
    // Why it didn't go, or what the gateway said back. Never a credential.
    reason: { type: String, default: "" },

    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

notificationLogSchema.index({ at: -1 });
notificationLogSchema.index({ channel: 1, sent: 1, at: -1 });
notificationLogSchema.index({ user: 1, at: -1 });

export default mongoose.models.NotificationLog || mongoose.model("NotificationLog", notificationLogSchema);
