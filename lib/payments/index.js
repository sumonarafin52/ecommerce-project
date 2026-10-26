// lib/payments/index.js
//
// The registry of payment providers the store can actually take money with.
//
// A provider appears here only once it has a working adapter. That's
// deliberate: lib/paymentGateways.js lists bKash, Nagad, Rocket, Stripe and
// PayPal so their credentials can be stored and the UI can describe them,
// but storing credentials is not an integration. A gateway with no adapter
// is configurable and invisible at checkout (its `checkoutLive` flag is
// false), rather than offered to a customer who would then be unable to pay.
//
// Adding a provider means writing one file to the contract in ./adapter.js
// and listing it here — no changes to the checkout route.
import sslcommerzAdapter from "@/lib/payments/sslcommerz";
import bkashAdapter from "@/lib/payments/bkash";
import Settings from "@/models/Settings";
import { decryptSecret } from "@/lib/crypto";
import { PAYMENT_GATEWAYS, sslcommerzEnvPassword } from "@/lib/paymentGateways";

const ADAPTERS = {
  [sslcommerzAdapter.id]: sslcommerzAdapter,
  [bkashAdapter.id]: bkashAdapter,
};

/** The adapter for a provider id, or null if the store can't charge with it. */
export function getPaymentAdapter(id) {
  return ADAPTERS[String(id || "")] || null;
}

/** Every provider that has a real implementation behind it. */
export function implementedProviders() {
  return Object.keys(ADAPTERS);
}

/**
 * Providers that are configurable in Settings but have no adapter yet.
 * Used to tell an admin the truth on the settings page rather than letting
 * them switch on something that can't take a payment.
 */
export function unimplementedProviders() {
  return PAYMENT_GATEWAYS.filter((g) => g.id !== "cod" && !ADAPTERS[g.id]).map((g) => ({ id: g.id, label: g.label }));
}

/**
 * Loads a provider's credentials from Settings, falling back to environment
 * variables for SSLCommerz so a store that was set up the old way keeps
 * working without a forced trip through the admin panel.
 *
 * Secrets are decrypted here and never leave the server.
 */
export async function getProviderCredentials(providerId) {
  const settings = await Settings.findOne().select("payment").lean();
  const stored = settings?.payment?.[providerId];
  const gateway = PAYMENT_GATEWAYS.find((g) => g.id === providerId);

  const credentials = { isLive: stored?.mode === "live" };

  // Only a gateway that's actually switched on contributes credentials —
  // matching the behaviour the SSLCommerz loader has always had. A half-
  // filled, disabled gateway must not start taking payments.
  if (stored?.enabled && stored?.fields && gateway) {
    for (const field of gateway.fields) {
      const raw = stored.fields[field.key];
      if (!raw) continue;
      credentials[field.key] = field.secret ? decryptSecret(raw) : raw;
    }
  }

  if (providerId === "sslcommerz") {
    // .env fallback, matching what getSslcommerzCredentials() has always done
    if (!credentials.storeId) credentials.storeId = process.env.SSLCOMMERZ_STORE_ID || "";
    if (!credentials.storePassword) {
      // both spellings have been accepted since before Settings existed
      credentials.storePassword = sslcommerzEnvPassword();
    }
    if (!stored?.enabled) credentials.isLive = process.env.SSLCOMMERZ_IS_LIVE === "true";
  }

  return credentials;
}
