// models/NewsletterSubscriber.js
import mongoose from "mongoose";

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, enum: ["subscribed", "unsubscribed"], default: "subscribed" },
    // random per-subscriber token for one-click unsubscribe links
    unsubscribeToken: { type: String, required: true, index: true },
    source: { type: String, default: "footer" },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

newsletterSubscriberSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.NewsletterSubscriber ||
  mongoose.model("NewsletterSubscriber", newsletterSubscriberSchema);
