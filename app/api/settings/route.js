// app/api/settings/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import { hasPermission } from "@/lib/rbac";
import { PAYMENT_GATEWAYS, MASK, isGatewayConfigured } from "@/lib/paymentGateways";
import { encryptSecret } from "@/lib/crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// there is only ever one Settings document — fetch it, creating a default
// one on first use so the rest of the app never has to null-check
async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
}

// Admin view: same document, but every secret credential field is replaced
// with a mask. The real value never leaves the server once saved — the
// admin UI only ever sees "is this set or not", never the value itself.
function toAdminSafeJSON(settings) {
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
  return { ...obj, payment: maskedPayment, email: { ...obj.email, smtpPassword: obj.email?.smtpPassword ? MASK : "" } };
}

// Public view (storefront): no credentials, no config shape at all — just
// which gateways are enabled and ready, so checkout can decide what to show.
// Only gateways with checkoutLive:true are ever offered — enabling a
// not-yet-integrated gateway (e.g. Stripe) configures it for later but
// doesn't put it in front of customers, since there's no real flow behind it.
function toPublicJSON(settings) {
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
      return !!(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD);
    }

    return stored?.enabled && isGatewayConfigured(gateway, stored.fields || {});
  }).map((g) => ({ id: g.id, label: g.label, region: g.region }));

  const { payment: _p, billing: _b, shipping: _s, email: _e, ...rest } = obj;
  return { ...rest, enabledPaymentMethods };
}

// GET: public callers (storefront Header/Footer/homepage) get the safe,
// credential-free view. Signed-in staff with "settings" permission get the
// full admin view (masked secrets) so the Settings pages can render state.
export async function GET(request) {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    const session = await getServerSession(authOptions);
    const isAdminViewer = session?.user && (await hasPermission(session, "settings"));

    const data = isAdminViewer ? toAdminSafeJSON(settings) : toPublicJSON(settings);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PUT: admin only — partial update, only known top-level sections are touched
export async function PUT(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const body = await request.json();
    const settings = await getOrCreateSettings();

    // only merge recognized sections — never trust arbitrary client keys
    if (body.general && typeof body.general === "object") {
      settings.general = { ...settings.general.toObject?.() ?? settings.general, ...body.general };
    }
    if (body.homepage && typeof body.homepage === "object") {
      if (Array.isArray(body.homepage.heroSlides)) settings.homepage.heroSlides = body.homepage.heroSlides;
      if (Array.isArray(body.homepage.banners)) settings.homepage.banners = body.homepage.banners;
      if (Array.isArray(body.homepage.sections)) settings.homepage.sections = body.homepage.sections;
      if (typeof body.homepage.showDeals === "boolean") settings.homepage.showDeals = body.homepage.showDeals;
      if (typeof body.homepage.showBestSellers === "boolean") settings.homepage.showBestSellers = body.homepage.showBestSellers;
    }

    if (body.billing && typeof body.billing === "object") {
      const currentBilling = settings.billing?.toObject?.() ?? settings.billing ?? {};
      const incomingBilling = { ...body.billing };
      if (incomingBilling.invoice && typeof incomingBilling.invoice === "object") {
        incomingBilling.invoice = { ...(currentBilling.invoice || {}), ...incomingBilling.invoice };
      }
      // nextInvoiceNumber only changes if explicitly sent as a positive
      // integer (the "Starting Invoice Number" field) — never wiped out by
      // an unrelated save of the rest of the billing form
      if (!(Number.isInteger(incomingBilling.nextInvoiceNumber) && incomingBilling.nextInvoiceNumber > 0)) {
        delete incomingBilling.nextInvoiceNumber;
      }
      settings.billing = { ...currentBilling, ...incomingBilling };
      settings.markModified("billing");
    }

    if (body.payment && typeof body.payment === "object") {
      const currentPayment = settings.payment || {};
      const nextPayment = { ...currentPayment };

      for (const gateway of PAYMENT_GATEWAYS) {
        const incoming = body.payment[gateway.id];
        if (!incoming || typeof incoming !== "object") continue;

        const existingGateway = currentPayment[gateway.id] || {};
        const existingFields = existingGateway.fields || {};
        const mergedFields = { ...existingFields };

        for (const f of gateway.fields) {
          const incomingValue = incoming.fields?.[f.key];
          if (incomingValue === undefined) continue;
          // a masked placeholder means "unchanged" — never overwrite a real
          // secret with the mask string itself
          if (f.secret && incomingValue === MASK) continue;
          // secrets are encrypted (AES-256-GCM) before they ever touch the
          // database — see lib/crypto.js
          mergedFields[f.key] = f.secret ? encryptSecret(incomingValue) : incomingValue;
        }

        const wantsEnabled = !!incoming.enabled;
        if (wantsEnabled && !isGatewayConfigured(gateway, mergedFields)) {
          return NextResponse.json(
            { success: false, message: `${gateway.label}: fill in all required fields before enabling it` },
            { status: 400 }
          );
        }

        nextPayment[gateway.id] = {
          enabled: wantsEnabled,
          mode: gateway.hasModes ? (incoming.mode === "live" ? "live" : "sandbox") : "live",
          fields: mergedFields,
        };
      }

      settings.payment = nextPayment;
      settings.markModified("payment");
    }

    if (body.email && typeof body.email === "object") {
      const currentEmail = settings.email?.toObject?.() ?? settings.email ?? {};
      const incoming = { ...body.email };
      // a masked placeholder means "unchanged" — never overwrite a real
      // secret with the mask string itself
      if (incoming.smtpPassword === undefined || incoming.smtpPassword === MASK) {
        delete incoming.smtpPassword;
      } else {
        incoming.smtpPassword = encryptSecret(incoming.smtpPassword);
      }
      settings.email = { ...currentEmail, ...incoming };
      settings.markModified("email");
    }

    settings.markModified("general");
    settings.markModified("homepage");
    await settings.save();

    return NextResponse.json({ success: true, data: toAdminSafeJSON(settings) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
