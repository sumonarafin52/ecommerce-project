// app/api/downloads/file/route.js
//
// Streams a purchased file to its buyer.
//
// This is the only code in the application that reads a DigitalProduct's
// storage URL in a request the browser can see, and the URL never reaches
// the response: the bytes are fetched server-side and piped through. A
// customer who saves the page, reads the network tab, or shares the link
// gets the signed token at most — which dies in two minutes and is bound to
// one grant and one file.
//
// A redirect to the storage URL would have been one line of code and would
// have defeated the entire design, since the browser would then hold a
// permanent public URL to the asset.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import DigitalProduct from "@/models/DigitalProduct";
import DownloadGrant from "@/models/DownloadGrant";
import { verifyDownloadToken, resolveFiles, logDownload, refundDownload } from "@/lib/digitalDelivery";
import { getClientIp } from "@/lib/rateLimit";

// Content-Disposition must not let a crafted file name break out of the
// header (CRLF injection) or smuggle quotes.
function safeFileName(name) {
  const cleaned = String(name || "download")
    .replace(/[\r\n"\\]/g, "")
    .replace(/[/\\?%*:|<>]/g, "-")
    .trim()
    .slice(0, 180);
  return cleaned || "download";
}

export async function GET(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";

  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const payload = verifyDownloadToken(token);
    if (!payload) {
      // Covers forged signatures, tampered payloads and expired tokens
      // alike — all indistinguishable to the caller.
      await logDownload({ outcome: "denied_token", detail: "invalid or expired token", ip, userAgent });
      return NextResponse.json(
        { success: false, message: "This download link has expired. Open it again from your downloads page." },
        { status: 403 }
      );
    }

    await connectDB();
    const grant = await DownloadGrant.findById(payload.grantId).lean();
    if (!grant) {
      await logDownload({ outcome: "denied_token", detail: "grant gone", ip, userAgent });
      return NextResponse.json({ success: false, message: "Not available" }, { status: 404 });
    }

    // The quota was already spent when the token was issued, so an expired
    // or exhausted grant isn't re-checked here (that would wrongly refuse
    // the last legitimate download). Revocation IS re-checked, because an
    // admin revoking access for fraud must take effect immediately rather
    // than leaving a live two-minute window.
    if (grant.revoked) {
      await logDownload({
        grant: grant._id,
        order: grant.order,
        product: grant.product,
        user: grant.user,
        outcome: "denied_revoked",
        ip,
        userAgent,
      });
      return NextResponse.json({ success: false, message: "Access to this download has been withdrawn." }, { status: 403 });
    }

    const dp = await DigitalProduct.findById(grant.digitalProduct).lean();
    const files = resolveFiles(dp);
    const file = files.find((f) => f.id === payload.fileId);
    if (!dp?.active || !file) {
      await refundDownload({ grantId: grant._id, nonce: payload.nonce });
      await logDownload({
        grant: grant._id,
        order: grant.order,
        product: grant.product,
        user: grant.user,
        outcome: "error",
        detail: "file missing from digital product",
        ip,
        userAgent,
      });
      return NextResponse.json({ success: false, message: "This file is no longer available." }, { status: 410 });
    }

    // Fetch from storage server-side.
    let upstream;
    try {
      upstream = await fetch(file.url);
    } catch (err) {
      // The download was spent when the token was issued. Delivery failed for
      // our reasons, not the customer's, so give it back.
      await refundDownload({ grantId: grant._id, nonce: payload.nonce });
      await logDownload({
        grant: grant._id,
        order: grant.order,
        product: grant.product,
        user: grant.user,
        fileName: file.name,
        outcome: "error",
        detail: `storage unreachable: ${err?.message || "fetch failed"}`,
        ip,
        userAgent,
      });
      return NextResponse.json(
        { success: false, message: "We couldn't reach the file right now. Please try again in a moment." },
        { status: 502 }
      );
    }

    if (!upstream.ok || !upstream.body) {
      await refundDownload({ grantId: grant._id, nonce: payload.nonce });
      await logDownload({
        grant: grant._id,
        order: grant.order,
        product: grant.product,
        user: grant.user,
        fileName: file.name,
        outcome: "error",
        detail: `storage returned ${upstream.status}`,
        ip,
        userAgent,
      });
      return NextResponse.json(
        { success: false, message: "We couldn't reach the file right now. Please try again in a moment." },
        { status: 502 }
      );
    }

    await logDownload({
      grant: grant._id,
      order: grant.order,
      product: grant.product,
      user: grant.user,
      guestEmail: grant.guestEmail,
      fileName: file.name,
      fileVersion: file.version,
      isPreview: file.isPreview,
      outcome: "served",
      ip,
      userAgent,
    });

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || file.type || "application/octet-stream");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    headers.set("Content-Disposition", `attachment; filename="${safeFileName(file.name)}"`);
    // A purchased file must never be cached by a CDN or shared proxy where
    // another customer's request could be served from it.
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error("[downloads:file]", error);
    await logDownload({ outcome: "error", detail: "file route threw", ip, userAgent });
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
