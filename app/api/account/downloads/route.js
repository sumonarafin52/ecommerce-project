// app/api/account/downloads/route.js
//
// Digital downloads for the signed-in customer, grouped by order — the shape
// the profile page's order list renders against.
//
// This route used to return each file's Cloudinary URL directly. That URL is
// permanent and needs no authentication, so once a customer had it (or
// shared it, or it was scraped from the response) the paid file was public
// forever, with no limit, no expiry and no way to revoke it.
//
// It now returns entitlement metadata only — grant id, file ids, remaining
// downloads, expiry, licence. Bytes require POST /api/downloads/[grantId],
// which checks ownership and spends a download.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import DigitalProduct from "@/models/DigitalProduct";
import DownloadGrant from "@/models/DownloadGrant";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createGrantsForOrder, grantToPublic } from "@/lib/digitalDelivery";
import { serverError } from "@/lib/apiError";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    let grants = await DownloadGrant.find({ user: session.user.id }).sort({ createdAt: -1 }).lean();

    // Backfill for orders paid before entitlements existed, so nobody loses
    // access to a file they already bought. One pass, only over orders that
    // have no grant yet.
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

    if (!grants.length) {
      return NextResponse.json({ success: true, data: {} });
    }

    // One query for all digital products referenced, rather than one per grant
    const dpIds = [...new Set(grants.map((g) => String(g.digitalProduct)))];
    const dps = await DigitalProduct.find({ _id: { $in: dpIds } }).lean();
    const byId = new Map(dps.map((d) => [String(d._id), d]));

    const byOrder = {};
    for (const grant of grants) {
      const pub = await grantToPublic(grant, byId.get(String(grant.digitalProduct)));
      const key = String(grant.order);
      if (!byOrder[key]) byOrder[key] = [];
      byOrder[key].push(pub);
    }

    return NextResponse.json({ success: true, data: byOrder });
  } catch (error) {
    return serverError(error, "api/account/downloads");
  }
}
