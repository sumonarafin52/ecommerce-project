// app/api/admin/downloads/[id]/route.js
//
// Actions on one customer's download entitlement, plus that entitlement's
// own download history.
//
// Four things an admin genuinely needs and previously could not do without
// opening the database:
//   revoke   — cut off access (chargeback, fraud, a leaked link)
//   restore  — undo that
//   extend   — push the expiry out for a customer who asked
//   topUp    — add downloads for someone who lost theirs to a dead laptop
//
// All four are bounded and audited. Nothing here can delete a purchase or
// alter what the customer paid.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import DownloadGrant from "@/models/DownloadGrant";
import DownloadLog from "@/models/DownloadLog";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isObjectId } from "@/lib/digitalDelivery";
import { notify } from "@/lib/notify";
import { serverError } from "@/lib/apiError";

const ACTIONS = ["revoke", "restore", "extend", "topUp"];

// GET: the download history for this entitlement.
export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const logs = await DownloadLog.find({ grant: params.id }).sort({ at: -1 }).limit(100).lean();

    return NextResponse.json({
      success: true,
      data: logs.map((l) => ({
        id: String(l._id),
        at: l.at,
        outcome: l.outcome,
        detail: l.detail || "",
        fileName: l.fileName || "",
        isPreview: !!l.isPreview,
        ip: l.ip || "",
        // Full user-agent strings are long and mostly noise in a table; the
        // admin only needs enough to tell devices apart.
        userAgent: (l.userAgent || "").slice(0, 120),
      })),
    });
  } catch (error) {
    return serverError(error, "api/admin/downloads/[id]");
  }
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
    }

    const grant = await DownloadGrant.findById(params.id);
    if (!grant) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    let message = "";

    if (action === "revoke") {
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      grant.revoked = true;
      grant.revokedReason = reason;
      grant.revokedAt = new Date();
      message = "Access revoked";
    } else if (action === "restore") {
      grant.revoked = false;
      grant.revokedReason = "";
      grant.revokedAt = null;
      message = "Access restored";
    } else if (action === "extend") {
      // Validate BEFORE clamping. Clamping first turned "-5" and "abc" into a
      // silent 1-day extension instead of an error — bad input has to be
      // refused, not quietly reinterpreted.
      const raw = parseInt(body.days, 10);
      if (!Number.isFinite(raw) || raw < 1) {
        return NextResponse.json({ success: false, message: "Enter a number of days (1 or more)" }, { status: 400 });
      }
      const days = Math.min(3650, raw);
      // Extend from today when access has already lapsed, otherwise from the
      // current expiry — so "extend by 30 days" never silently shortens an
      // entitlement that still had longer to run.
      const from =
        grant.expiresAt && new Date(grant.expiresAt).getTime() > Date.now() ? new Date(grant.expiresAt) : new Date();
      grant.expiresAt = new Date(from.getTime() + days * 86_400_000);
      message = `Access extended by ${days} day${days === 1 ? "" : "s"}`;
    } else if (action === "topUp") {
      const raw = parseInt(body.downloads, 10);
      if (!Number.isFinite(raw) || raw < 1) {
        return NextResponse.json(
          { success: false, message: "Enter a number of downloads (1 or more)" },
          { status: 400 }
        );
      }
      const extra = Math.min(1000, raw);
      if (grant.downloadLimit === 0) {
        return NextResponse.json(
          { success: false, message: "This purchase already has unlimited downloads" },
          { status: 400 }
        );
      }
      // Raise the ceiling rather than zeroing the counter, so the download
      // history stays truthful about how many have actually been taken.
      grant.downloadLimit += extra;
      message = `Added ${extra} download${extra === 1 ? "" : "s"}`;
    }

    await grant.save();

    // The customer should hear about anything that changes their access.
    if (grant.user) {
      const text = {
        revoke: `Access to your download of ${grant.productName} has been withdrawn.${grant.revokedReason ? ` Reason: ${grant.revokedReason}` : ""} Please contact support if you think this is a mistake.`,
        restore: `Your download of ${grant.productName} is available again.`,
        extend: `Your download access for ${grant.productName} has been extended.`,
        topUp: `We've added more downloads to your purchase of ${grant.productName}.`,
      }[action];

      await notify({
        user: grant.user,
        type: "account",
        title: action === "revoke" ? "Download access withdrawn" : "Download access updated",
        message: text,
        link: "/account/downloads",
      });
    }

    return NextResponse.json({
      success: true,
      message,
      data: {
        id: String(grant._id),
        revoked: grant.revoked,
        revokedReason: grant.revokedReason,
        expiresAt: grant.expiresAt,
        downloadLimit: grant.downloadLimit,
        downloadCount: grant.downloadCount,
        downloadsRemaining: grant.downloadLimit > 0 ? Math.max(0, grant.downloadLimit - grant.downloadCount) : null,
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/downloads/[id]");
  }
}
