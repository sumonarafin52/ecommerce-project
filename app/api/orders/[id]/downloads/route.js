// app/api/orders/[id]/downloads/route.js
//
// Digital downloads for one order. Kept as its own route because the order
// confirmation page and a guest's order page both need "what did I just
// buy that I can download" without loading the whole account.
//
// Two bugs this route used to have, beyond exposing the storage URL:
//
//   * `order.user.toString()` threw on guest orders — `user` became optional
//     when guest checkout landed, so a guest order containing a digital
//     product produced a 500 here, and a guest could never reach their file
//     at all. Guests now authenticate with the order's access token, the
//     same mechanism the order page itself uses.
//   * the POST handler returned the raw fileUrl and incremented a global
//     counter, so the per-customer limit was unenforceable.
//
// Downloading is now POST /api/downloads/[grantId]; this route only lists
// what exists.
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
import { hasPermission } from "@/lib/rbac";
import { serverError } from "@/lib/apiError";

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const guestToken = new URL(request.url).searchParams.get("t") || "";

    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    if (!session?.user && !guestToken) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id).select("+guestAccessToken").lean();
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // `order.user` is null for guest orders — checked before dereferencing.
    const isOwner = !!session?.user && !!order.user && String(order.user) === String(session.user.id);
    const isGuestHolder =
      !!guestToken && !!order.guestAccessToken && timingSafeEqualStr(guestToken, order.guestAccessToken);
    const isStaff = !!session?.user && (await hasPermission(session, "orders"));

    if (!isOwner && !isGuestHolder && !isStaff) {
      return NextResponse.json({ success: false, message: "Not your order" }, { status: 403 });
    }

    // Digital goods deliver on payment, not on physical fulfilment.
    if (order.paymentStatus !== "paid") {
      return NextResponse.json({ success: true, data: [] });
    }

    await createGrantsForOrder(order);
    const grants = await DownloadGrant.find({ order: order._id }).lean();
    if (!grants.length) return NextResponse.json({ success: true, data: [] });

    const dpIds = [...new Set(grants.map((g) => String(g.digitalProduct)))];
    const dps = await DigitalProduct.find({ _id: { $in: dpIds } }).lean();
    const byId = new Map(dps.map((d) => [String(d._id), d]));

    const data = await Promise.all(grants.map((g) => grantToPublic(g, byId.get(String(g.digitalProduct)))));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, "api/orders/downloads");
  }
}
