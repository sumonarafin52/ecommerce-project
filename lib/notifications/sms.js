// lib/notifications/sms.js
//
// Sending a text message.
//
// Bangladeshi bulk-SMS providers (Alpha SMS, MIMSMS, REVE, BulkSMSBD,
// SSLWireless and most others) all expose the same shape of API: one HTTP
// request carrying an API key, a recipient and the message body. They differ
// only in the hostname and the parameter names.
//
// So rather than writing — and pretending to maintain — a separate
// integration per provider, this is one configurable HTTP gateway: the admin
// pastes the request URL their provider documented, using {to} and {text}
// where the number and the message go. That is a real integration with
// whichever provider they actually have, not a stub named after one.
//
// A provider that needs something this can't express (an OAuth handshake, a
// signed payload) would need its own adapter — and the settings page says so
// rather than silently failing.
import { decryptSecret } from "@/lib/crypto";
import Settings from "@/models/Settings";

/**
 * Normalises a Bangladeshi number to the form gateways expect (8801XXXXXXXXX).
 * Customers type theirs every which way — 01711…, +8801711…, 8801711…, with
 * spaces and dashes — and a gateway that silently drops a malformed number
 * is indistinguishable from one that's broken.
 *
 * Numbers that aren't recognisably Bangladeshi are passed through with only
 * punctuation stripped, so an international store isn't locked out.
 */
export function normalizePhone(raw, defaultCountryCode = "88") {
  const digits = String(raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return "";

  // already 8801XXXXXXXXX (13 digits)
  if (/^8801\d{9}$/.test(digits)) return digits;
  // 01XXXXXXXXX -> 8801XXXXXXXXX. The leading zero is KEPT: Bangladesh's
  // international form is 880 followed by the subscriber number, so dropping
  // it produces a 12-digit number every gateway rejects.
  if (/^01\d{9}$/.test(digits)) return `${defaultCountryCode}${digits}`;
  // 1XXXXXXXXX — the zero was dropped somewhere upstream; put it back
  if (/^1\d{9}$/.test(digits)) return `${defaultCountryCode}0${digits}`;

  return digits;
}

/** Whether a normalised number looks sendable. */
export function isSendablePhone(phone) {
  const n = normalizePhone(phone);
  // a real mobile number is never shorter than this, and a gateway charges
  // for the attempt either way
  return n.length >= 10 && n.length <= 15;
}

/**
 * SMS costs money per message and has a hard length limit, so the body is
 * trimmed rather than sent as three billed parts of marketing prose.
 * 160 characters is one GSM-7 segment.
 */
export function smsBody(text, limit = 160) {
  const clean = String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

export async function getSmsConfig() {
  try {
    const settings = await Settings.findOne().select("notifications").lean();
    const sms = settings?.notifications?.sms;
    if (sms?.enabled && sms?.urlTemplate) {
      return {
        enabled: true,
        urlTemplate: sms.urlTemplate,
        method: sms.method === "POST" ? "POST" : "GET",
        apiKey: sms.apiKey ? decryptSecret(sms.apiKey) : "",
        senderId: sms.senderId || "",
        bodyTemplate: sms.bodyTemplate || "",
        contentType: sms.contentType || "application/x-www-form-urlencoded",
      };
    }
  } catch {
    // fall through — SMS simply isn't available
  }
  return { enabled: false };
}

/** Fills {to}, {text}, {apiKey} and {senderId} into a template, URL-encoded. */
function fillTemplate(template, values, encode) {
  return String(template).replace(/\{(to|text|apiKey|senderId)\}/g, (_, key) => {
    const v = values[key] ?? "";
    return encode ? encodeURIComponent(v) : v;
  });
}

/**
 * Sends one text message.
 *
 * Never throws: like sendEmail, this is called from order and payment paths
 * where a failed text must not take the operation down with it. Returns
 * { sent, reason } so the caller can log what happened.
 */
export async function sendSms({ to, text }) {
  const phone = normalizePhone(to);
  if (!phone) return { sent: false, reason: "no phone number" };
  if (!isSendablePhone(phone)) return { sent: false, reason: `phone number doesn't look valid: ${to}` };

  const config = await getSmsConfig();
  if (!config.enabled) return { sent: false, reason: "SMS not configured" };

  const body = smsBody(text);
  const values = { to: phone, text: body, apiKey: config.apiKey, senderId: config.senderId };

  try {
    const url = fillTemplate(config.urlTemplate, values, true);
    const init = { method: config.method };

    if (config.method === "POST") {
      init.headers = { "Content-Type": config.contentType };
      if (config.bodyTemplate) {
        // A JSON body is filled without URL-encoding; a form body with it.
        const isJson = config.contentType.includes("json");
        init.body = fillTemplate(config.bodyTemplate, values, !isJson);
      }
    }

    const res = await fetch(url, init);
    const responseText = await res.text().catch(() => "");

    if (!res.ok) {
      return { sent: false, reason: `gateway returned ${res.status}: ${responseText.slice(0, 120)}` };
    }

    // Most of these gateways answer 200 even for a rejection, with the
    // reason in the body — so an obvious error word is treated as a failure
    // rather than reported as a delivered message.
    if (/error|invalid|fail|insufficient|unauthor/i.test(responseText)) {
      return { sent: false, reason: `gateway rejected it: ${responseText.slice(0, 120)}` };
    }

    return { sent: true, reason: responseText.slice(0, 120) };
  } catch (err) {
    return { sent: false, reason: err?.message || "request failed" };
  }
}
