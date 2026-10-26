// app/api/downloads/route.js
//
// "My Digital Products" — every download entitlement the caller owns.
//
// Returns metadata only: file names, sizes, versions, remaining downloads,
// expiry, licence key. No storage URL appears anywhere in this response, and
// no amount of inspecting it yields one. Getting bytes requires a second,
// authorised call (POST /api/downloads/[id]) that spends a download.
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import DigitalProduct from "@/models/DigitalProduct";
import DownloadGrant from "@/models/DownloadGrant";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createGrantsForOrder, grantToPublic, isObjectId } from "@/lib/digitalDelivery";
import { serverError } from "@/lib/apiError";

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const url = new URL(request.url);
    const orderId = url.searchParams.get("order") || "";
    const guestToken = url.searchParams.get("t") || "";

    // --- guest access: one order, proven by its access token -------------
    // A guest has no account, so their entitlement is reached through the
    // unguessable token emailed with the order. The token is compared in
    // constant time and never echoed back.
    if (!session?.user) {
      if (!orderId || !guestToken || !isObjectId(orderId)) {
        return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
      }
      const order = await Order.findById(orderId).select("+guestAccessToken").lean();
      if (!order || !order.guestAccessToken || !timingSafeEqualStr(guestToken, order.guestAccessToken)) {
        // Same response whether the order doesn't exist or the token is
        // wrong — probing must not reveal which order ids are real.
        return NextResponse.json({ success: false, message: "Not available" }, { status: 403 });
      }
      if (order.paymentStatus !== "paid") {
        return NextResponse.json({ success: true, data: [] });
      }
      await createGrantsForOrder(order);
      const grants = await DownloadGrant.find({ order: order._id }).sort({ createdAt: -1 }).lean();
      return NextResponse.json({ success: true, data: await decorate(grants) });
    }

    // --- signed-in customer: every entitlement they hold -----------------
    let grants = await DownloadGrant.find({ user: session.user.id }).sort({ createdAt: -1 }).lean();

    // Backfill. Orders paid before this system existed (and any order whose
    // grant creation failed at payment time) have no grants yet. Issuing
    // them on first read means no migration script is needed and nobody
    // loses access to something they bought.
    const paidOrders = await Order.find({ user: session.user.id, paymentStatus: "paid" })
      .select("items orderNumber user guestEmail paymentStatus")
      .lean();
    const covered = new Set(grants.map((g) => String(g.order)));
    const missing = paidOrders.filter((o) => !covered.has(String(o._id)));
    if (missing.length) {
      let issued = 0;
      for (const o of missing) issued += await createGrantsForOrder(o);
      if (issued) {
        grants = await DownloadGrant.find({ user: session.user.id }).sort({ createdAt: -1 }).lean();
      }
    }

    return NextResponse.json({ success: true, data: await decorate(grants) });
  } catch (error) {
    return serverError(error, "api/downloads");
  }
}

// One query for every digital product referenced, rather than one per grant.
async function decorate(grants) {
  if (!grants.length) return [];
  const dpIds = [...new Set(grants.map((g) => String(g.digitalProduct)))];
  const dps = await DigitalProduct.find({ _id: { $in: dpIds } }).lean();
  const byId = new Map(dps.map((d) => [String(d._id), d]));
  return Promise.all(grants.map((g) => grantToPublic(g, byId.get(String(g.digitalProduct)))));
}
