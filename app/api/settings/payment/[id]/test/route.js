// app/api/settings/payment/[id]/test/route.js
//
// "Test connection" for a payment gateway.
//
// Credentials that look filled in and credentials that work are different
// things, and the difference normally surfaces at the worst possible
// moment — a real customer, at checkout, on a real order. This makes the
// smallest real call the gateway offers (for bKash, granting a token) so
// an admin finds out now instead.
//
// It moves no money, and it answers with the gateway's own message rather
// than a generic failure, because "wrong app key" and "this account isn't
// live yet" need different fixes.
//
// Mirrors the carrier test endpoint, which does the same job for couriers.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getPaymentAdapter, getProviderCredentials } from "@/lib/payments";
import { rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    // Each test is a real request to the gateway; a held-down button
    // shouldn't become a burst of them against a rate-limited API.
    const limited = await rateLimit(`payment-test:${session.user.id}`, { max: 10, windowMs: 60_000 });
    if (!limited.allowed) {
      return NextResponse.json({ success: false, message: "Too many tests — wait a minute." }, { status: 429 });
    }

    const adapter = getPaymentAdapter(params.id);
    if (!adapter) {
      return NextResponse.json(
        { success: false, message: "This gateway has no integration yet, so there's nothing to test." },
        { status: 400 }
      );
    }
    if (typeof adapter.testConnection !== "function") {
      return NextResponse.json(
        { success: false, message: `${adapter.label} has no connection test.` },
        { status: 400 }
      );
    }

    // Read from Settings, so what gets tested is exactly what checkout will
    // use — including whether sandbox or live is selected. Secrets are
    // decrypted server-side and never travel back to the browser.
    const credentials = await getProviderCredentials(params.id);
    const result = await adapter.testConnection(credentials);

    return NextResponse.json({
      success: !!result.ok,
      message: result.ok ? result.message : result.error,
      mode: credentials.isLive ? "live" : "sandbox",
    });
  } catch (error) {
    return serverError(error, "api/settings/payment/test");
  }
}
