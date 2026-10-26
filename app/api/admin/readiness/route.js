// app/api/admin/readiness/route.js
//
// Answers one question for the admin: can this store actually take an order
// right now?
//
// This exists because of a real failure that was invisible from the admin
// side: with Cash on Delivery switched off in Settings and SSLCommerz not
// fully configured, the storefront's checkout showed "No payment methods are
// currently available" and no order could be placed — while the admin panel
// looked perfectly healthy. Nothing surfaced it, so the store could sit
// unable to sell.
//
// Every check below reads real configuration and reports what it finds. No
// invented scores, no "health: 94%" — each item is either a blocker (orders
// are impossible), a warning (something will not work as expected), or
// absent.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";
import DigitalProduct from "@/models/DigitalProduct";
import { getOrCreateSettings, toPublicJSON } from "@/lib/settingsService";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    // Same permission as the dashboard this renders on.
    if (!(await hasPermission(session, "dashboard"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const settings = await getOrCreateSettings();
    const pub = toPublicJSON(settings);
    const enabled = pub.enabledPaymentMethods || [];

    const [publicProducts, physicalPublic, digitalPublic, zoneCount, methodCount, digitalWithoutPolicy] =
      await Promise.all([
        Product.countDocuments({ status: "public" }),
        // "auto" with no digital file, or an explicit "always"
        Product.countDocuments({
          status: "public",
          $or: [
            { shippingRequirement: "always" },
            { shippingRequirement: { $in: [null, "auto"] }, digitalProduct: null },
          ],
        }),
        Product.countDocuments({ status: "public", digitalProduct: { $ne: null } }),
        ShippingZone.countDocuments({ active: true }),
        ShippingMethod.countDocuments({ active: true }),
        // A digital product nobody can download because it's switched off
        DigitalProduct.countDocuments({ active: false }),
      ]);

    const issues = [];

    // --- blockers: an order genuinely cannot be placed ------------------
    if (enabled.length === 0) {
      issues.push({
        id: "no_payment_method",
        level: "blocker",
        title: "No payment method is available",
        detail:
          "Customers reach checkout and cannot pay, so no order can be placed. Turn on Cash on Delivery, or finish configuring a gateway.",
        action: { label: "Open payment settings", href: "/admin/settings/payment" },
      });
    }

    if (publicProducts === 0) {
      issues.push({
        id: "no_public_products",
        level: "blocker",
        title: "No products are published",
        detail: "Nothing is visible to customers. Products set to draft, private or unlisted don't appear in the store.",
        action: { label: "Open products", href: "/admin/products" },
      });
    }

    // Shipping only blocks the store if there is something to ship.
    if (physicalPublic > 0 && (zoneCount === 0 || methodCount === 0)) {
      issues.push({
        id: "no_shipping",
        level: "blocker",
        title: "No delivery options are configured",
        detail:
          zoneCount === 0
            ? `You have ${physicalPublic} product${physicalPublic === 1 ? "" : "s"} that need delivery, but no shipping zone exists — checkout shows "no delivery methods" for every address. A zone with no regions listed acts as a catch-all for the whole country.`
            : `You have shipping zones but no active delivery method in them, so checkout has nothing to offer.`,
        action: { label: "Open shipping settings", href: "/admin/settings/shipping" },
      });
    }

    // --- warnings: works, but not as intended ---------------------------
    if (enabled.length > 0 && !enabled.some((m) => m.id !== "cod")) {
      issues.push({
        id: "cod_only",
        level: "warning",
        title: "Cash on Delivery is the only payment method",
        detail: "Customers can't pay by card or mobile banking, and digital products can't be delivered automatically.",
        action: { label: "Open payment settings", href: "/admin/settings/payment" },
      });
    }

    if (digitalPublic > 0 && !enabled.some((m) => m.id !== "cod")) {
      issues.push({
        id: "digital_needs_online_payment",
        level: "warning",
        title: "Downloads can't be delivered automatically",
        detail: `${digitalPublic} published product${digitalPublic === 1 ? " has" : "s have"} a download attached, but downloads unlock on confirmed payment — with Cash on Delivery only, you'd have to mark each order paid by hand.`,
        action: { label: "Open payment settings", href: "/admin/settings/payment" },
      });
    }

    if (digitalWithoutPolicy > 0) {
      issues.push({
        id: "inactive_digital_products",
        level: "warning",
        title: `${digitalWithoutPolicy} digital product${digitalWithoutPolicy === 1 ? " is" : "s are"} switched off`,
        detail: "Customers who buy a product linked to one of these won't get a download.",
        action: { label: "Open digital products", href: "/admin/digital" },
      });
    }

    const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER) || !!settings.email?.host;
    if (!smtpConfigured) {
      issues.push({
        id: "no_email",
        level: "warning",
        title: "Order emails aren't being sent",
        detail:
          "No mail server is configured, so customers get no order confirmation, no payment receipt and no guest order link.",
        action: { label: "See deployment notes", href: "/admin/settings" },
      });
    }

    // DOWNLOAD_SIGNING_SECRET is optional (NEXTAUTH_SECRET is the fallback),
    // so this is only worth mentioning when downloads are actually in use.
    if (digitalPublic > 0 && !process.env.DOWNLOAD_SIGNING_SECRET && !process.env.NEXTAUTH_SECRET) {
      issues.push({
        id: "no_download_secret",
        level: "blocker",
        title: "Downloads can't be signed",
        detail: "Set DOWNLOAD_SIGNING_SECRET (or NEXTAUTH_SECRET) — without it, download links can't be issued.",
      });
    }

    const blockers = issues.filter((i) => i.level === "blocker");

    return NextResponse.json({
      success: true,
      data: {
        canAcceptOrders: blockers.length === 0,
        issues,
        // the plain facts behind the verdict, so the admin can check the work
        facts: {
          enabledPaymentMethods: enabled.map((m) => m.label),
          publicProducts,
          physicalProducts: physicalPublic,
          digitalProducts: digitalPublic,
          activeShippingZones: zoneCount,
          activeShippingMethods: methodCount,
        },
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/readiness");
  }
}
