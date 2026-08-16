// lib/sslcommerz.js
// Shared SSLCommerz helpers — credential resolution and server-to-server
// verification live here so app/api/checkout/route.js (payment webhook) and
// app/api/orders/[id]/refund/route.js (gateway refund) use the exact same
// logic instead of two copies drifting apart.
import { createRequire } from "module";
import Settings from "@/models/Settings";
import { decryptSecret } from "@/lib/crypto";

const require = createRequire(import.meta.url);
export const SslCommerzPayment = require("sslcommerz-lts");

// Settings → Payment Methods → SSLCommerz takes priority once an admin
// configures and enables it there; env vars remain the fallback so
// deployments that haven't touched the new Settings UI keep working exactly
// as before (non-breaking).
export async function getSslcommerzCredentials() {
  try {
    const settings = await Settings.findOne().lean();
    const stored = settings?.payment?.sslcommerz;
    if (stored?.enabled && stored?.fields?.storeId && stored?.fields?.storePassword) {
      return {
        storeId: stored.fields.storeId,
        storePass: decryptSecret(stored.fields.storePassword),
        isLive: stored.mode === "live",
      };
    }
  } catch {
    // fall through to env vars below
  }
  return {
    storeId: process.env.SSLCOMMERZ_STORE_ID,
    storePass: process.env.SSLCOMMERZ_STORE_PASS || process.env.SSLCOMMERZ_STORE_PASSWORD,
    isLive: process.env.SSLCOMMERZ_IS_LIVE === "true",
  };
}

// Verifies a transaction server-to-server against SSLCommerz's own Validation
// API before trusting it. Without this, the "success" postback is just an
// unauthenticated POST with a `status` field anyone could forge — this
// closes that hole by re-checking with SSLCommerz directly.
export async function verifySslcommerzTransaction({ valId, storeId, storePass, isLive }) {
  if (!valId) return null;
  const base = isLive
    ? "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
    : "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
  const url = `${base}?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePass)}&format=json`;
  try {
    const res = await fetch(url).then((r) => r.json());
    return res;
  } catch {
    return null;
  }
}
