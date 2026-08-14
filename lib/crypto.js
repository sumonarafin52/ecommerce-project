// lib/crypto.js
// Encrypts payment-gateway secrets (Stripe secret key, bKash app secret,
// SSLCommerz store password, etc.) before they're written to MongoDB, so a
// database leak/backup exposure alone doesn't hand over live gateway
// credentials. Values are already masked before ever reaching the browser
// (see app/api/settings/route.js) — this is a second, independent layer
// covering the database itself.
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:";

function getKey() {
  // Prefer a dedicated key; fall back to NEXTAUTH_SECRET so this works
  // out of the box without a new required env var. If you rotate
  // NEXTAUTH_SECRET without also setting PAYMENT_ENCRYPTION_KEY, previously
  // encrypted credentials will need to be re-entered — set a stable,
  // dedicated PAYMENT_ENCRYPTION_KEY in production to avoid that.
  const secret = process.env.PAYMENT_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Set PAYMENT_ENCRYPTION_KEY (or NEXTAUTH_SECRET) to store payment credentials");
  }
  return crypto.createHash("sha256").update(secret).digest(); // 32-byte key
}

export function encryptSecret(plainText) {
  if (!plainText) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value) {
  if (!value || !value.startsWith(PREFIX)) return value || ""; // plain/legacy values pass through unchanged
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv(
      ALGO,
      getKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return ""; // wrong/rotated key — fail closed, never leak ciphertext
  }
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}
