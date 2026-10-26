// app/api/admin/stats/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { hasPermission } from "@/lib/rbac";
import { storeTimezone, startOfDay, startOfDaysAgo, daySpan, dayLabel } from "@/lib/storeTime";
import { serverError } from "@/lib/apiError";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// What counts as revenue:
//   money actually received, minus money given back.
// So: orders whose payment succeeded (paid, or partially refunded and still
// marked paid), summing totalAmount − refund.amount. A fully refunded order
// nets to zero and drops out. Unpaid COD orders are NOT revenue — they're
// reported separately as "to collect".
const PAID = ["paid", "refunded"];
const netRevenue = {
  $sum: {
    $cond: [
      { $in: ["$paymentStatus", PAID] },
      { $subtract: ["$totalAmount", { $ifNull: ["$refund.amount", 0] }] },
      0,
    ],
  },
};

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const allowed =
      session?.user && ((await hasPermission(session, "dashboard")) || (await hasPermission(session, "reports")));
    if (!allowed) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parseDate = (v, fallback) => {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : fallback;
    };
    const to = parseDate(searchParams.get("to"), new Date());
    const from = parseDate(searchParams.get("from"), new Date(Date.now() - 29 * 864e5));
    const inRange = { createdAt: { $gte: from, $lte: to } };

    // Every "per day" figure below is counted on the shop's own clock. It
    // used to be counted three different ways at once — see lib/storeTime.js
    // for what that did to a shop six hours ahead of UTC.
    const timezone = await storeTimezone();

    const now = new Date();
    const todayStart = startOfDay(now, timezone);
    const weekStart = startOfDaysAgo(6, timezone, now.getTime());

    // The same length of time immediately before this range, so a figure
    // can be compared with something instead of standing on its own. An
    // exact mirror: 30 days against the 30 days before them.
    const spanMs = Math.max(1, to.getTime() - from.getTime());
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(from.getTime() - spanMs);
    const inPrevRange = { createdAt: { $gte: prevFrom, $lte: prevTo } };

    const [
      totals,
      previous,
      today,
      week,
      statusRows,
      methodRows,
      daily,
      topProducts,
      productCounts,
      customerCount,
      newCustomers,
      buyerRows,
      recent,
    ] = await Promise.all([
        Order.aggregate([
          { $match: inRange },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: netRevenue,
              paidOrders: { $sum: { $cond: [{ $in: ["$paymentStatus", PAID] }, 1, 0] } },
              refunded: { $sum: { $ifNull: ["$refund.amount", 0] } },
              // cash still to collect: unpaid COD that hasn't been cancelled or
              // returned (cancelled orders used to be counted here, inflating it)
              codPending: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$paymentMethod", "cod"] },
                        { $eq: ["$paymentStatus", "pending"] },
                        { $not: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }] },
                      ],
                    },
                    "$totalAmount",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        // The same two figures over the period immediately before this one.
        Order.aggregate([
          { $match: inPrevRange },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: netRevenue,
              paidOrders: { $sum: { $cond: [{ $in: ["$paymentStatus", PAID] }, 1, 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          { $group: { _id: null, orders: { $sum: 1 }, revenue: netRevenue } },
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: weekStart } } },
          { $group: { _id: null, orders: { $sum: 1 }, revenue: netRevenue } },
        ]),
        Order.aggregate([{ $match: inRange }, { $group: { _id: "$orderStatus", n: { $sum: 1 } } }]),
        Order.aggregate([{ $match: inRange }, { $group: { _id: "$paymentMethod", n: { $sum: 1 }, revenue: netRevenue } }]),
        Order.aggregate([
          { $match: inRange },
          {
            $group: {
              // Bucketed on the shop's clock, not the server's. Without the
              // timezone, a Dhaka shop's 2am order was counted as yesterday.
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone } },
              revenue: netRevenue,
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        // best sellers by units actually sold — paid orders only, so unpaid or
        // cancelled baskets don't show as sales
        Order.aggregate([
          { $match: { ...inRange, paymentStatus: { $in: PAID }, orderStatus: { $nin: ["cancelled"] } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.name",
              qty: { $sum: "$items.quantity" },
              revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
            },
          },
          { $sort: { qty: -1 } },
          { $limit: 5 },
        ]),
        Product.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              outOfStock: { $sum: { $cond: [{ $lte: ["$stock", 0] }, 1, 0] } },
              lowStock: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$stock", 0] },
                        { $lte: ["$stock", { $ifNull: ["$lowStockThreshold", 5] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        User.countDocuments({ role: "customer" }),
        // Accounts opened inside the range — growth, as opposed to the
        // total, which only ever goes up and so says nothing about a month.
        User.countDocuments({ role: "customer", createdAt: { $gte: from, $lte: to } }),
        // New vs returning BUYERS: everyone who ordered in the range, with
        // the date of their first ever order. Someone whose first order is
        // inside the range is new; anyone else is coming back. Guests are
        // grouped by the email they checked out with, so a guest who orders
        // twice is one returning customer rather than two new ones.
        Order.aggregate([
          {
            $group: {
              _id: { $ifNull: ["$user", { $toLower: { $ifNull: ["$guestEmail", "$shippingAddress.phone"] } }] },
              firstOrder: { $min: "$createdAt" },
              inRange: { $sum: { $cond: [{ $and: [{ $gte: ["$createdAt", from] }, { $lte: ["$createdAt", to] }] }, 1, 0] } },
            },
          },
          { $match: { _id: { $ne: null }, inRange: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              newBuyers: { $sum: { $cond: [{ $gte: ["$firstOrder", from] }, 1, 0] } },
              returningBuyers: { $sum: { $cond: [{ $lt: ["$firstOrder", from] }, 1, 0] } },
            },
          },
        ]),
        Order.find().sort({ createdAt: -1 }).limit(5).select("orderNumber totalAmount orderStatus paymentStatus createdAt shippingAddress.fullName").lean(),
      ]);

    const t = totals[0] || {};
    const prev = previous[0] || {};
    const buyers = buyerRows[0] || { newBuyers: 0, returningBuyers: 0 };

    // The series the chart draws: every day in the range, in order, with
    // quiet days present as zeroes rather than missing. Built here, in the
    // shop's timezone, so the browser never rebuilds dates and the labels
    // can't drift away from the bars.
    const byDay = new Map(daily.map((d) => [d._id, d]));
    const series = daySpan(from, to, timezone).map((key) => ({
      date: key,
      label: dayLabel(key, timezone),
      revenue: byDay.get(key)?.revenue || 0,
      orders: byDay.get(key)?.orders || 0,
    }));

    /** Percentage change, or null when there's nothing to compare against. */
    const change = (current, before) => {
      if (!before) return null; // "up from nothing" is not a percentage
      return Math.round(((current - before) / before) * 1000) / 10;
    };

    return NextResponse.json({
      success: true,
      data: {
        range: { from, to },
        timezone,
        orders: t.orders || 0,
        revenue: t.revenue || 0,
        refunded: t.refunded || 0,
        paidOrders: t.paidOrders || 0,
        avgOrder: t.paidOrders ? (t.revenue || 0) / t.paidOrders : 0,
        codPending: t.codPending || 0,
        todayOrders: today[0]?.orders || 0,
        todayRevenue: today[0]?.revenue || 0,
        weekOrders: week[0]?.orders || 0,
        weekRevenue: week[0]?.revenue || 0,
        statusCounts: Object.fromEntries(statusRows.map((r) => [r._id || "unknown", r.n])),
        paymentMethods: methodRows.map((r) => ({ method: r._id || "unknown", orders: r.n, revenue: r.revenue })),
        daily: series,
        previous: {
          from: prevFrom,
          to: prevTo,
          orders: prev.orders || 0,
          revenue: prev.revenue || 0,
          avgOrder: prev.paidOrders ? (prev.revenue || 0) / prev.paidOrders : 0,
        },
        change: {
          orders: change(t.orders || 0, prev.orders || 0),
          revenue: change(t.revenue || 0, prev.revenue || 0),
          avgOrder: change(
            t.paidOrders ? (t.revenue || 0) / t.paidOrders : 0,
            prev.paidOrders ? (prev.revenue || 0) / prev.paidOrders : 0
          ),
        },
        buyers: { new: buyers.newBuyers, returning: buyers.returningBuyers },
        newCustomers,
        topProducts: topProducts.map((p) => ({ name: p._id, qty: p.qty, revenue: p.revenue })),
        products: productCounts[0] || { total: 0, outOfStock: 0, lowStock: 0 },
        customers: customerCount,
        recentOrders: recent,
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/stats");
  }
}
