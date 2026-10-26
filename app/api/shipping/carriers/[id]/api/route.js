// app/api/shipping/carriers/[id]/api/route.js
//
// A carrier's API integration: which provider, its credentials, and a
// button that proves they work.
//
// Kept separate from the carrier's own details (name, phone, tracking URL)
// because this is the only part carrying credentials — which are encrypted
// on the way in and never sent back out.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ShippingCarrier from "@/models/ShippingCarrier";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getCarrierAdapter, listCarrierProviders, adapterForCarrier } from "@/lib/carriers";
import { encryptSecret } from "@/lib/crypto";
import { MASK } from "@/lib/paymentGateways";
import { rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Login required" }, { status: 401 }) };
  if (!(await hasPermission(session, "settings"))) {
    return { error: NextResponse.json({ success: false, message: "No permission" }, { status: 403 }) };
  }
  return { session };
}

/** What the admin screen needs: the provider list, and this carrier's state. */
export async function GET(request, { params }) {
  try {
    await connectDB();
    const { error } = await guard();
    if (error) return error;

    const carrier = await ShippingCarrier.findById(params.id).lean();
    if (!carrier) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    const api = carrier.api || {};
    const adapter = getCarrierAdapter(api.provider);
    const stored = api.credentials || {};

    return NextResponse.json({
      success: true,
      data: {
        providers: listCarrierProviders(),
        connected: !!api.connected,
        provider: api.provider || "manual",
        // only whether each credential is set, never its value
        credentials: Object.fromEntries(
          (adapter.fields || []).map((f) => [f.key, stored[f.key] ? (f.secret ? MASK : stored[f.key]) : ""])
        ),
        lastTestedAt: api.lastTestedAt || null,
        lastTestOk: api.lastTestOk ?? null,
        lastTestMessage: api.lastTestMessage || "",
      },
    });
  } catch (err) {
    return serverError(err, "api/shipping/carriers/api");
  }
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const { error } = await guard();
    if (error) return error;

    const carrier = await ShippingCarrier.findById(params.id);
    if (!carrier) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    const body = (await request.json()) || {};
    const providerId = typeof body.provider === "string" ? body.provider : "manual";
    const adapter = getCarrierAdapter(providerId);

    const current = carrier.api?.credentials || {};
    const next = { ...current };
    if (body.credentials && typeof body.credentials === "object") {
      for (const field of adapter.fields || []) {
        const value = body.credentials[field.key];
        if (value === undefined) continue;
        // The UI sends the mask back for an unchanged secret — writing that
        // through would replace the credential with asterisks.
        if (field.secret && value === MASK) continue;
        next[field.key] = value ? (field.secret ? encryptSecret(String(value)) : String(value).slice(0, 300)) : "";
      }
    }

    carrier.api = {
      ...(carrier.api?.toObject?.() ?? carrier.api ?? {}),
      provider: adapter.id,
      // Manual has nothing to connect to, so it's never "connected".
      connected: adapter.id === "manual" ? false : !!body.connected,
      credentials: next,
    };
    carrier.markModified("api");
    await carrier.save();

    return NextResponse.json({ success: true, message: "Carrier integration saved" });
  } catch (err) {
    return serverError(err, "api/shipping/carriers/api");
  }
}

/** Proves the stored credentials actually work, before an order depends on them. */
export async function POST(request, { params }) {
  try {
    await connectDB();
    const { error, session } = await guard();
    if (error) return error;

    // A test is a real call to someone else's API.
    const limit = await rateLimit(`carrier-test:${session.user.id}`, { max: 15, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many tests — wait a few minutes." }, { status: 429 });
    }

    const carrier = await ShippingCarrier.findById(params.id);
    if (!carrier) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    // Test what's saved, not what's on screen — the saved credentials are
    // the ones an order will use.
    const { adapter, credentials } = adapterForCarrier({
      ...carrier.toObject(),
      api: { ...(carrier.api?.toObject?.() ?? carrier.api ?? {}), connected: true },
    });

    const result = await adapter.testConnection(credentials);

    carrier.api = {
      ...(carrier.api?.toObject?.() ?? carrier.api ?? {}),
      lastTestedAt: new Date(),
      lastTestOk: !!result.ok,
      lastTestMessage: String(result.message || "").slice(0, 300),
    };
    carrier.markModified("api");
    await carrier.save();

    return NextResponse.json({ success: !!result.ok, message: result.message });
  } catch (err) {
    return serverError(err, "api/shipping/carriers/api");
  }
}
