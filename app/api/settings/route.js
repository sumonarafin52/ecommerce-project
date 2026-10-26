// app/api/settings/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import { hasPermission } from "@/lib/rbac";
import { PAYMENT_GATEWAYS, MASK, isGatewayConfigured } from "@/lib/paymentGateways";
import { getOrCreateSettings, toAdminSafeJSON, toPublicJSON } from "@/lib/settingsService";
import { encryptSecret } from "@/lib/crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";
import { INFO_PAGE_KEYS } from "@/lib/pageTemplates";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import { clearTimezoneCache, safeTimezone } from "@/lib/storeTime";

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
    return serverError(error, "api/settings");
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
      // A timezone the platform doesn't recognise would make MongoDB reject
      // every report aggregation, so it is checked here rather than being
      // discovered later by a page that won't load.
      if (body.general.timezone !== undefined) {
        settings.general.timezone = safeTimezone(body.general.timezone);
      }
    }
    if (body.checkout && typeof body.checkout === "object") {
      const mode = body.checkout.guestCheckout;
      if (["off", "cod", "all"].includes(mode)) {
        settings.checkout = { ...(settings.checkout?.toObject?.() ?? settings.checkout ?? {}), guestCheckout: mode };
        settings.markModified("checkout");
      }
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

    let paymentWarnings = [];
    if (body.payment && typeof body.payment === "object") {
      const currentPayment = settings.payment || {};
      const nextPayment = { ...currentPayment };

      const warnings = [];
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

        let wantsEnabled = !!incoming.enabled;
        if (wantsEnabled && !isGatewayConfigured(gateway, mergedFields)) {
          // don't abort the whole save over one incomplete gateway — save
          // its fields as entered, just leave it disabled, and tell the
          // admin why
          wantsEnabled = false;
          warnings.push(`${gateway.label} needs all required fields filled in before it can be enabled — left disabled for now.`);
        }

        nextPayment[gateway.id] = {
          enabled: wantsEnabled,
          mode: gateway.hasModes ? (incoming.mode === "live" ? "live" : "sandbox") : "live",
          fields: mergedFields,
        };
      }

      settings.payment = nextPayment;
      settings.markModified("payment");
      paymentWarnings = warnings;
    }

    if (body.notifications && typeof body.notifications === "object") {
      const current = settings.notifications?.toObject?.() ?? settings.notifications ?? {};
      const incoming = body.notifications;
      const next = { ...current };

      if (incoming.channels && typeof incoming.channels === "object") {
        next.channels = {
          inApp: incoming.channels.inApp !== false,
          email: !!incoming.channels.email,
          sms: !!incoming.channels.sms,
        };
      }

      if (incoming.events && typeof incoming.events === "object") {
        // Only ids this build knows about, and only the three channels —
        // an unrecognised key here would silently never be read.
        const clean = {};
        for (const ev of NOTIFICATION_EVENTS) {
          const row = incoming.events[ev.id];
          if (!row || typeof row !== "object") continue;
          clean[ev.id] = { inApp: !!row.inApp, email: !!row.email, sms: !!row.sms };
        }
        next.events = clean;
      }

      if (incoming.sms && typeof incoming.sms === "object") {
        const currentSms = current.sms || {};
        const sms = { ...currentSms };
        if (incoming.sms.enabled !== undefined) sms.enabled = !!incoming.sms.enabled;
        if (incoming.sms.providerName !== undefined) sms.providerName = String(incoming.sms.providerName).slice(0, 80);
        if (incoming.sms.urlTemplate !== undefined) sms.urlTemplate = String(incoming.sms.urlTemplate).slice(0, 1000);
        if (incoming.sms.method !== undefined) sms.method = incoming.sms.method === "POST" ? "POST" : "GET";
        if (incoming.sms.contentType !== undefined) sms.contentType = String(incoming.sms.contentType).slice(0, 80);
        if (incoming.sms.bodyTemplate !== undefined) sms.bodyTemplate = String(incoming.sms.bodyTemplate).slice(0, 1000);
        if (incoming.sms.senderId !== undefined) sms.senderId = String(incoming.sms.senderId).slice(0, 40);
        // The key is write-only: the UI sends the mask back when unchanged,
        // exactly as the payment gateways do, so it isn't overwritten with
        // asterisks.
        if (incoming.sms.apiKey !== undefined && incoming.sms.apiKey !== MASK) {
          sms.apiKey = incoming.sms.apiKey ? encryptSecret(String(incoming.sms.apiKey)) : "";
        }
        next.sms = sms;
      }

      settings.notifications = next;
      settings.markModified("notifications");
    }

    if (body.tax && typeof body.tax === "object") {
      const current = settings.tax?.toObject?.() ?? settings.tax ?? {};
      const next = { ...current };
      if (body.tax.enabled !== undefined) next.enabled = !!body.tax.enabled;
      if (body.tax.pricesIncludeTax !== undefined) next.pricesIncludeTax = !!body.tax.pricesIncludeTax;
      if (body.tax.displayNote !== undefined) next.displayNote = String(body.tax.displayNote || "").slice(0, 120);
      if (body.tax.basedOn !== undefined) {
        next.basedOn = body.tax.basedOn === "store" ? "store" : "shipping";
      }
      if (body.tax.storeCountry !== undefined) next.storeCountry = String(body.tax.storeCountry || "").slice(0, 80);
      if (body.tax.storeState !== undefined) next.storeState = String(body.tax.storeState || "").slice(0, 80);
      settings.tax = next;
      settings.markModified("tax");
    }

    if (body.pages && typeof body.pages === "object") {
      const current = settings.pages?.toObject?.() ?? settings.pages ?? {};
      const next = { ...current };
      const stamps = { ...(settings.pagesUpdatedAt || {}) };
      for (const key of INFO_PAGE_KEYS) {
        const v = body.pages[key];
        if (typeof v !== "string") continue;
        const value = v.slice(0, 20000);
        if (value !== (current[key] || "")) stamps[key] = new Date(); // only real edits move the date
        next[key] = value;
      }
      settings.pages = next;
      settings.pagesUpdatedAt = stamps;
      settings.markModified("pages");
      settings.markModified("pagesUpdatedAt");
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

    // Reports read the shop's timezone through a one-minute cache; drop it
    // here so a corrected timezone takes effect on the next report rather
    // than looking as if the setting hadn't saved.
    clearTimezoneCache();

    return NextResponse.json({ success: true, data: toAdminSafeJSON(settings), warnings: paymentWarnings });
  } catch (error) {
    return serverError(error, "api/settings");
  }
}
