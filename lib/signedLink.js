// lib/signedLink.js
//
// Short-lived, tamper-proof links for things a person must be able to do
// from an email without signing in — today, turning off basket reminders.
//
// The payload is only base64: anyone holding the link can read it, which is
// fine because it carries nothing secret, just which account it acts on,
// what it is allowed to do, and when it stops working. The HMAC is what
// makes it unforgeable — without it, "?user=<id>" in a URL would let anyone
// change anyone's settings by editing the address bar.
//
// A near-identical signer exists in lib/digitalDelivery.js for download
// links. It is left alone deliberately: it is live, paid-for content and
// its tokens are already in customers' inboxes. This one is general, and
// new link types belong here rather than in a third copy.
import crypto from "crypto";

function signingSecret() {
  // Shares the dedicated signing secret with download links, falling back
  // to NEXTAUTH_SECRET so a store that has set neither still works. Rotating
  // either one invalidates outstanding links, which is the intended
  // behaviour for a link that should not live forever.
  const secret = process.env.DOWNLOAD_SIGNING_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("DOWNLOAD_SIGNING_SECRET or NEXTAUTH_SECRET must be set to sign email links");
  return secret;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/**
 * @param purpose  what this link is allowed to do ("cart_reminders_off").
 *                 Checked on the way back in, so a token minted for one
 *                 action can never be replayed against another.
 * @param subject  who it acts on — a user id.
 * @param ttlMs    how long it stays valid.
 */
export function signLink({ purpose, subject, ttlMs = 30 * 24 * 3600_000 }) {
  const payload = JSON.stringify({
    p: String(purpose),
    s: String(subject),
    e: Date.now() + ttlMs,
    n: crypto.randomBytes(6).toString("hex"),
  });
  const body = b64url(payload);
  const mac = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/**
 * Returns { purpose, subject } for a valid token, or null for anything
 * malformed, tampered with, expired, or minted for a different purpose.
 */
export function verifyLink(token, expectedPurpose) {
  if (typeof token !== "string" || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let expected;
  try {
    expected = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  } catch {
    return null;
  }

  // Compared byte-for-byte in constant time, so a wrong signature can't be
  // narrowed down one character at a time.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload.e !== "number" || Date.now() > payload.e) return null;
  if (expectedPurpose && payload.p !== expectedPurpose) return null;

  return { purpose: payload.p, subject: payload.s, expiresAt: payload.e };
}
