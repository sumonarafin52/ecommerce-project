// app/api/downloads/[id]/route.js
//
// Spends one download from a grant and returns a short-lived signed token.
//
// This is the authorisation boundary for digital goods. Every refusal path
// matters, so they're all explicit:
//
//   * not signed in and no valid guest token   → 401 / 403
//   * grant belongs to somebody else           → 403   (the IDOR case:
//     changing the id in the URL to another customer's grant must fail even
//     though that grant is perfectly valid for its real owner)
//   * grant revoked / expired / quota spent    → 403 with the reason
//   * too many download attempts               → 429
//
// Nothing here trusts the client beyond the grant id and which file was
// asked for — the limit, the expiry and the ownership all come from the
// database, and the quota is spent with a conditional update so two clicks
// on the last download can't both win.
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import DigitalProduct from "@/models/DigitalProduct";
import DownloadGrant from "@/models/DownloadGrant";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { claimDownload, logDownload, resolveFiles, isObjectId } from "@/lib/digitalDelivery";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const DENIAL_MESSAGES = {
  denied_auth: "This download isn't available to you.",
  denied_limit: "You've used all the downloads included with this purchase. Contact support if you need access again.",
  denied_expired: "The download period for this purchase has ended. Contact support if you need access again.",
  denied_revoked: "Access to this download has been withdrawn. Please contact support.",
};

export async function POST(request, { params }) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";

  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const grantId = params.id;

    // Reject non-ids before touching the database — a probe with a garbage
    // id should be a 404, not a CastError 500.
    if (!isObjectId(grantId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const fileId = typeof body?.fileId === "string" ? body.fileId.slice(0, 64) : "";

    // Rate limit per identity, falling back to IP for guests. Stops a leaked
    // grant id being hammered, and caps how fast someone can walk through
    // grant ids looking for one that isn't theirs.
    const who = session?.user?.id || `ip:${ip}`;
    const limit = await rateLimit(`download-claim:${who}`, { max: 40, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      await logDownload({ grant: grantId, outcome: "denied_rate", ip, userAgent, user: session?.user?.id || null });
      return NextResponse.json(
        { success: false, message: "Too many download requests — please wait a few minutes." },
        { status: 429 }
      );
    }

    const grant = await DownloadGrant.findById(grantId);
    if (!grant) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    // ---- ownership ------------------------------------------------------
    // Resolved from the grant, never from anything the caller sent.
    let owns = false;
    if (session?.user && grant.user && String(grant.user) === String(session.user.id)) {
      owns = true;
    } else if (!grant.user && grant.guestEmail) {
      // Guest grant: prove possession of the order's access token.
      const guestToken = new URL(request.url).searchParams.get("t") || "";
      if (guestToken) {
        const order = await Order.findById(grant.order).select("+guestAccessToken").lean();
        owns = !!order?.guestAccessToken && timingSafeEqualStr(guestToken, order.guestAccessToken);
      }
    }

    if (!owns) {
      await logDownload({
        grant: grant._id,
        order: grant.order,
        product: grant.product,
        user: session?.user?.id || null,
        outcome: "denied_auth",
        detail: session?.user ? "signed in as a different customer" : "no session, no valid guest token",
        ip,
        userAgent,
      });
      // 403 either way, with no hint about whose grant this is.
      return NextResponse.json(
        { success: false, message: DENIAL_MESSAGES.denied_auth },
        { status: session?.user ? 403 : 401 }
      );
    }

    // ---- which file -----------------------------------------------------
    const dp = await DigitalProduct.findById(grant.digitalProduct).lean();
    const files = resolveFiles(dp);
    if (!dp?.active || !files.length) {
      return NextResponse.json(
        { success: false, message: "This file is no longer available. Please contact support." },
        { status: 410 }
      );
    }
    const file = fileId ? files.find((f) => f.id === fileId) : files.find((f) => !f.isPreview) || files[0];
    if (!file) {
      return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
    }

    // ---- spend a download ----------------------------------------------
    const claim = await claimDownload({ grant, fileId: file.id, isPreview: file.isPreview });
    if (!claim.ok) {
      await logDownload({
        grant: grant._id,
        order: grant.order,
        product: grant.product,
        user: grant.user,
        guestEmail: grant.guestEmail,
        fileName: file.name,
        fileVersion: file.version,
        outcome: claim.reason,
        ip,
        userAgent,
      });
      return NextResponse.json(
        { success: false, reason: claim.reason, message: DENIAL_MESSAGES[claim.reason] || DENIAL_MESSAGES.denied_auth },
        { status: 403 }
      );
    }

    const after = claim.grant || grant;
    return NextResponse.json({
      success: true,
      data: {
        // The browser gets a token, not a URL. It expires in ~2 minutes and
        // authorises exactly this one file from this one grant.
        token: claim.token,
        fileName: file.name,
        fileSize: file.size,
        downloadCount: after.downloadCount,
        downloadsRemaining: after.downloadLimit > 0 ? Math.max(0, after.downloadLimit - after.downloadCount) : null,
      },
    });
  } catch (error) {
    await logDownload({ outcome: "error", detail: "claim route threw", ip, userAgent });
    return serverError(error, "api/downloads/claim");
  }
}
