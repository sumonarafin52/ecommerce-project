// lib/settingsService.js
//
// Shared access to the single Settings document and the two views of it.
//
// These used to live inside app/api/settings/route.js, which meant anything
// else needing "which payment methods are actually usable?" either imported
// from a route file or re-implemented the rule. The store-readiness check
// needs exactly that answer, so the logic moved here and the settings route
// now imports it — one definition, one behaviour.
import Settings from "@/models/Settings";
import { PAYMENT_GATEWAYS, MASK, isGatewayConfigured, sslcommerzConfiguredFromEnv } from "@/lib/paymentGateways";

// there is only ever one Settings document — fetch it, creating a default
// one on first use so the rest of the app never has to null-check
export async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
}

// Admin view: same document, but every secret credential field is replaced
// with a mask. The real value never leaves the server once saved — the
// admin UI only ever sees "is this set or not", never the value itself.
export function toAdminSafeJSON(settings) {
  const obj = settings.toObject();
  const payment = obj.payment || {};
  const maskedPayment = {};
  for (const gateway of PAYMENT_GATEWAYS) {
    const stored = payment[gateway.id] || {};
    const fields = { ...(stored.fields || {}) };
    for (const f of gateway.fields) {
      if (f.secret && fields[f.key]) fields[f.key] = MASK;
    }
    maskedPayment[gateway.id] = {
      enabled: !!stored.enabled,
      mode: stored.mode || "sandbox",
      fields,
      configured: isGatewayConfigured(gateway, stored.fields || {}),
    };
  }
  return {
    ...obj,
    payment: maskedPayment,
    email: { ...obj.email, smtpPassword: obj.email?.smtpPassword ? MASK : "" },
    // the SMS gateway key is a credential like any other — the admin UI only
    // ever learns whether one is set, never its value
    notifications: {
      ...obj.notifications,
      sms: { ...(obj.notifications?.sms || {}), apiKey: obj.notifications?.sms?.apiKey ? MASK : "" },
    },
  };
}

// Public view (storefront): no credentials, no config shape at all — just
// which gateways are enabled and ready, so checkout can decide what to show.
// Only gateways with checkoutLive:true are ever offered — enabling a
// not-yet-integrated gateway (e.g. Stripe) configures it for later but
// doesn't put it in front of customers, since there's no real flow behind it.
export function toPublicJSON(settings) {
  const obj = settings.toObject();
  const payment = obj.payment || {};
  const enabledPaymentMethods = PAYMENT_GATEWAYS.filter((gateway) => {
    if (!gateway.checkoutLive) return false;
    const stored = payment[gateway.id];

    // Cash on Delivery needs no configuration — on by default until
    // explicitly turned off.
    if (gateway.id === "cod") return stored ? stored.enabled !== false : true;

    // SSLCommerz: if Settings has never been touched, fall back to whatever
    // is in .env (matches app/api/checkout/route.js's own fallback), so a
    // store that configured SSLCommerz the old way — via .env — keeps
    // working exactly as before without a forced trip to Settings first.
    if (gateway.id === "sslcommerz" && !stored) {
      return sslcommerzConfiguredFromEnv();
    }

    return stored?.enabled && isGatewayConfigured(gateway, stored.fields || {});
  }).map((g) => ({ id: g.id, label: g.label, region: g.region }));

  // pages: long policy text is rendered server-side from the DB; no need to
  // ship it with every header/footer settings request
  const {
    payment: _p,
    billing: _b,
    shipping: _s,
    email: _e,
    pages: _pg,
    pagesUpdatedAt: _pu,
    // notification routing and the SMS gateway are store configuration, not
    // anything the storefront needs
    notifications: _n,
    ...rest
  } = obj;
  return { ...rest, enabledPaymentMethods };
}

