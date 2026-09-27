// app/api/account/downloads/route.js
//
// Returns every digital download the signed-in customer is entitled to,
// grouped by order, in one request.
//
// Replaces an N+1 pattern: the profile page previously fired a separate
// /api/orders/{id}/downloads request for every paid order, so a customer
// with 40 paid orders triggered 40 HTTP round-trips (each running its own
// Product.find + populate) just to render one page. This does the whole
// thing in two queries.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    // Digital goods deliver on payment, not on physical fulfillment — so
    // only paid orders are considered, same rule as the per-order route.
    const orders = await Order.find({ user: session.user.id, paymentStatus: "paid" })
      .select("items")
      .lean();

    if (!orders.length) {
      return NextResponse.json({ success: true, data: {} });
    }

    // one lookup for every product referenced across all those orders
    const productIds = [...new Set(orders.flatMap((o) => o.items.map((it) => String(it.product))))];
    const products = await Product.find({ _id: { $in: productIds } })
      .select("digitalProduct")
      .populate("digitalProduct")
      .lean();

    const digitalByProduct = new Map();
    for (const p of products) {
      if (p.digitalProduct && p.digitalProduct.active) {
        digitalByProduct.set(String(p._id), p.digitalProduct);
      }
    }

    // group into { [orderId]: [ ...downloadable items ] }, omitting orders
    // that have nothing digital in them
    const byOrder = {};
    for (const order of orders) {
      const downloadable = [];
      for (const it of order.items) {
        const dp = digitalByProduct.get(String(it.product));
        if (!dp) continue;
        downloadable.push({
          productId: String(it.product),
          name: it.name,
          fileName: dp.fileName || dp.title,
          fileUrl: dp.fileUrl,
          fileSize: dp.fileSize,
          fileType: dp.fileType,
        });
      }
      if (downloadable.length) byOrder[String(order._id)] = downloadable;
    }

    return NextResponse.json({ success: true, data: byOrder });
  } catch (error) {
    console.error("[account:downloads]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
