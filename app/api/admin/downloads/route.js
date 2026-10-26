// app/api/admin/downloads/route.js
//
// The operational view of digital delivery: who holds what entitlement, how
// much of it they've used, and what the download log shows.
//
// This exists because the pieces it reads — DownloadGrant.revoked, the
// frozen per-purchase limit, DownloadLog — were previously unreachable from
// the admin panel. A grant could be revoked only by editing the database by
// hand, and a shared or leaked download was invisible. Everything here acts
// on real records; nothing is estimated.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import DownloadGrant from "@/models/DownloadGrant";
import DownloadLog from "@/models/DownloadLog";
import User from "@/models/User";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { grantBlockReason } from "@/lib/digitalDelivery";
import { serverError } from "@/lib/apiError";

const PAGE_SIZE = 25;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    // Digital assets are managed under the "products" permission, same as the
    // Digital Products page itself.
    if (!(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const status = url.searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1);

    // Search and status both want $or, so they're combined under $and rather
    // than one quietly overwriting the other.
    const clauses = [];

    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      // Customer search goes through the user collection first — grants store
      // a product-name snapshot, not the buyer's name.
      const users = await User.find({ $or: [{ name: rx }, { email: rx }] })
        .select("_id")
        .limit(50)
        .lean();
      clauses.push({
        $or: [
          { productName: rx },
          { orderNumber: rx },
          { guestEmail: rx },
          { licenseKey: rx },
          ...(users.length ? [{ user: { $in: users.map((u) => u._id) } }] : []),
        ],
      });
    }

    const now = new Date();
    const notExpired = { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
    const hasDownloadsLeft = {
      $expr: { $or: [{ $eq: ["$downloadLimit", 0] }, { $lt: ["$downloadCount", "$downloadLimit"] }] },
    };

    if (status === "revoked") clauses.push({ revoked: true });
    else if (status === "expired") clauses.push({ revoked: false, expiresAt: { $ne: null, $lt: now } });
    else if (status === "exhausted") {
      clauses.push({
        revoked: false,
        $expr: { $and: [{ $gt: ["$downloadLimit", 0] }, { $gte: ["$downloadCount", "$downloadLimit"] }] },
      });
    } else if (status === "active") {
      // usable right now: not revoked, not expired, downloads remaining
      clauses.push({ revoked: false }, notExpired, hasDownloadsLeft);
    }

    const filter = clauses.length ? { $and: clauses } : {};

    const [total, grants] = await Promise.all([
      DownloadGrant.countDocuments(filter),
      DownloadGrant.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name email")
        .lean(),
    ]);

    // Abuse signal, computed from the log rather than guessed: how many
    // distinct IPs have pulled each of these grants. One purchase served to
    // a dozen addresses is a shared account or a leaked link. This is a
    // signal for a human to judge, not an automatic penalty.
    const grantIds = grants.map((g) => g._id);
    const ipAgg = grantIds.length
      ? await DownloadLog.aggregate([
          { $match: { grant: { $in: grantIds }, outcome: "served" } },
          { $group: { _id: "$grant", ips: { $addToSet: "$ip" }, lastAt: { $max: "$at" } } },
        ])
      : [];
    const ipMap = new Map(ipAgg.map((r) => [String(r._id), { ipCount: r.ips.filter(Boolean).length, lastAt: r.lastAt }]));

    const data = grants.map((g) => {
      const extra = ipMap.get(String(g._id)) || { ipCount: 0, lastAt: null };
      return {
        id: String(g._id),
        orderId: String(g.order),
        orderNumber: g.orderNumber,
        productName: g.productName,
        customerName: g.user?.name || "",
        customerEmail: g.user?.email || g.guestEmail || "",
        isGuest: !g.user,
        purchasedAt: g.createdAt,
        downloadCount: g.downloadCount,
        downloadLimit: g.downloadLimit,
        downloadsRemaining: g.downloadLimit > 0 ? Math.max(0, g.downloadLimit - g.downloadCount) : null,
        expiresAt: g.expiresAt,
        lastDownloadAt: g.lastDownloadAt,
        licenseKey: g.licenseKey,
        revoked: !!g.revoked,
        revokedReason: g.revokedReason || "",
        blocked: grantBlockReason(g),
        distinctIps: extra.ipCount,
      };
    });

    return NextResponse.json({
      success: true,
      data: { grants: data, total, page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) },
    });
  } catch (error) {
    return serverError(error, "api/admin/downloads");
  }
}
