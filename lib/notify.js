// lib/notify.js
import Notification from "@/models/Notification";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import Settings from "@/models/Settings";
import NotificationLog from "@/models/NotificationLog";
import { channelsFor, getEvent } from "@/lib/notifications/events";
import { sendSms } from "@/lib/notifications/sms";

// Notification text can contain user-controlled content (support subjects,
// customer names, product names). It must be escaped before going into an
// email's HTML, or anyone could inject markup — e.g. a convincing fake
// "reset your password" link — straight into a recipient's inbox.
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// Branded wrapper used by every email the store sends: store name up top,
// contact details and policy links at the bottom. Previously emails had no
// sender identity at all — just a heading and one sentence.
// `bodyHtml` (already escaped by its builder) replaces the plain message.
export function emailTemplate({ title, message, link, linkLabel = "View details", bodyHtml, store = {} }) {
  const siteUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  // only ever link to a path on our own site
  const safeLink = typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : "";
  const name = store.storeName || "Our store";
  const contact = [store.storeEmail, store.storePhone].filter(Boolean).map(escapeHtml).join(" · ");
  return `
  <div style="background:#FBF5E9;padding:24px 12px;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #EFE4C8;border-radius:14px;overflow:hidden;">
      <div style="background:#1E3A5F;padding:16px 24px;">
        <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:7px;background:#2C5282;color:#C98A2B;font-weight:bold;font-family:Georgia,serif;font-size:17px;vertical-align:middle;">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <span style="color:#FFFFFF;font-size:17px;font-weight:bold;font-family:Georgia,serif;vertical-align:middle;margin-left:8px;">${escapeHtml(name)}</span>
      </div>
      <div style="padding:26px 24px 22px;">
        <h2 style="color:#1E3A5F;margin:0 0 14px;font-family:Georgia,serif;font-size:21px;">${escapeHtml(title)}</h2>
        ${bodyHtml || `<p style="color:#2B2318;font-size:14px;line-height:1.6;margin:0;">${escapeHtml(message)}</p>`}
        ${
          safeLink
            ? `<a href="${escapeHtml(siteUrl + safeLink)}" style="display:inline-block;margin-top:22px;background:#C98A2B;color:#1E3A5F;font-weight:bold;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;">${escapeHtml(linkLabel)}</a>`
            : ""
        }
      </div>
      <div style="padding:16px 24px;border-top:1px solid #EFE4C8;background:#FFFCF6;font-size:12px;line-height:1.6;color:#8C8168;">
        ${contact ? `Questions? ${contact}<br>` : ""}
        ${store.storeAddress ? `${escapeHtml(store.storeAddress)}<br>` : ""}
        ${
          siteUrl
            ? `<a href="${escapeHtml(siteUrl)}/contact" style="color:#8C8168;">Contact</a> · <a href="${escapeHtml(siteUrl)}/return-policy" style="color:#8C8168;">Returns</a> · <a href="${escapeHtml(siteUrl)}/privacy-policy" style="color:#8C8168;">Privacy</a>`
            : ""
        }
      </div>
    </div>
  </div>`;
}

let storeCache = { at: 0, value: {} };
export async function storeDetailsForEmail() {
  // settings change rarely; avoid a DB read for every single email
  if (Date.now() - storeCache.at < 60_000) return storeCache.value;
  try {
    const s = await Settings.findOne().select("general.storeName general.storeEmail general.storePhone general.storeAddress").lean();
    storeCache = { at: Date.now(), value: s?.general || {} };
  } catch {}
  return storeCache.value;
}

/**
 * Sends one notification, over whichever channels the store has enabled for
 * this kind of event.
 *
 * The signature is unchanged from when this only did in-app + email, so
 * every existing caller keeps working; `phone` is new and optional, and a
 * caller that passes one makes SMS possible for that event.
 *
 * Deliberately swallows its own errors on every channel: this is always
 * called from inside another operation (placing an order, verifying a
 * payment, updating a shipment) and a notification failing must never roll
 * back or fail that operation.
 *
 * Channel resolution lives in lib/notifications/events.js. Every attempt —
 * delivered or not — is written to NotificationLog, so "did the customer
 * actually get told?" has an answer.
 */
export async function notify({ user, guestEmail, phone, type, title, message, link = "", linkLabel, emailHtml }) {
  // What actually happened, per channel. Every existing caller ignores the
  // return value and is unaffected; a caller that needs to know — the
  // basket reminder, which must not record "reminded" for an email that
  // never left the building — can read it.
  const outcome = { inApp: null, email: null, sms: null };

  try {
    const settings = await Settings.findOne().select("notifications").lean();
    const channels = channelsFor(type, settings?.notifications || {});
    const event = getEvent(type);

    // Work out who this is going to. An account holder's address comes from
    // their record; a guest gave one at checkout and has no account to show
    // an in-app notification in.
    let email = "";
    let name = "";
    if (user) {
      const person = await User.findById(user).select("email name").lean();
      email = person?.email || "";
      name = person?.name || "";
    } else if (guestEmail) {
      email = guestEmail;
    }

    if (!user && !email && !phone) return outcome; // nobody to reach

    const log = (channel, recipient, sent, reason) =>
      NotificationLog.create({
        event: type || "",
        channel,
        user: user || null,
        recipient: String(recipient || "").slice(0, 200),
        title: String(title || "").slice(0, 200),
        sent,
        reason: String(reason || "").slice(0, 300),
        at: new Date(),
      }).catch(() => {
        /* the log is for humans; never let it break a delivery */
      });

    // ---- in-app ------------------------------------------------------
    // Only an account holder has somewhere to see these.
    if (channels.inApp && user) {
      try {
        await Notification.create({ user, type, title, message, link });
        outcome.inApp = { sent: true, reason: "" };
        await log("inApp", String(user), true, "");
      } catch (err) {
        outcome.inApp = { sent: false, reason: err.message };
        await log("inApp", String(user), false, err.message);
      }
    }

    // ---- email --------------------------------------------------------
    if (channels.email && email) {
      const res = await sendEmail({
        to: email,
        subject: title,
        html: emailTemplate({
          title,
          message,
          link,
          linkLabel,
          bodyHtml: emailHtml,
          store: await storeDetailsForEmail(),
        }),
      });
      outcome.email = { sent: !!res.sent, reason: res.reason || "" };
      await log("email", email, !!res.sent, res.reason || "");
    }

    // ---- SMS ----------------------------------------------------------
    // Only for events worth a text, and only when a number came with the
    // call. Texting somebody about a product question they forgot they asked
    // is how a store teaches people to ignore its messages.
    if (channels.sms && phone && (!event || event.smsWorthy)) {
      const store = await storeDetailsForEmail();
      const prefix = store.storeName ? `${store.storeName}: ` : "";
      const res = await sendSms({ to: phone, text: `${prefix}${message}` });
      outcome.sms = { sent: !!res.sent, reason: res.reason || "" };
      await log("sms", phone, !!res.sent, res.reason || "");
    }
  } catch (err) {
    console.error("[notify] failed:", err.message);
  }

  return outcome;
}
