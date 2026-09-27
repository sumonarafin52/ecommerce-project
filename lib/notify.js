// lib/notify.js
import Notification from "@/models/Notification";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";

// Notification text can contain user-controlled content (support subjects,
// customer names, product names). It must be escaped before going into an
// email's HTML, or anyone could inject markup — e.g. a convincing fake
// "reset your password" link — straight into a recipient's inbox.
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function emailTemplate({ title, message, link }) {
  const siteUrl = process.env.NEXTAUTH_URL || "";
  // only ever link to a path on our own site
  const safeLink = typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : "";
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E3A5F; margin: 0 0 12px;">${escapeHtml(title)}</h2>
      <p style="color: #2B2318; font-size: 14px; line-height: 1.6;">${escapeHtml(message)}</p>
      ${
        safeLink
          ? `<a href="${escapeHtml(siteUrl + safeLink)}" style="display: inline-block; margin-top: 16px; background: #C98A2B; color: #1E3A5F; font-weight: bold; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 13px;">View details</a>`
          : ""
      }
    </div>
  `;
}

/**
 * Creates an in-app notification for a customer, and — if email is
 * configured (Settings → Email) — also sends the same update by email.
 * Deliberately swallows its own errors on both fronts: this is always
 * called from inside another operation (placing an order, verifying a
 * payment, updating a shipment...) and a notification failing to save or
 * send should never roll back or fail that operation.
 */
export async function notify({ user, type, title, message, link = "" }) {
  try {
    if (!user) return;
    await Notification.create({ user, type, title, message, link });

    const person = await User.findById(user).select("email name").lean();
    if (person?.email) {
      await sendEmail({
        to: person.email,
        subject: title,
        html: emailTemplate({ title, message, link }),
      });
    }
  } catch (err) {
    console.error("[notify] failed to create notification:", err.message);
  }
}
