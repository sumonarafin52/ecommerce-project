// app/api/admin/carts/route.js
//
// The baskets customers have left behind.
//
// Values are computed from TODAY's prices and TODAY's stock, not from
// whatever the browser last held, so the admin list can't quietly inflate
// itself on stale numbers. A recovered basket is empty by then, so its row
// shows what it was worth when the reminder went out — labelled as such by
// the page.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Cart from "@/models/Cart";
import CartRecovery from "@/models/CartRecovery";
import User from "@/models/User";
import Order from "@/models/Order";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";
import { revalidateCart } from "@/lib/cartRevalidation";
import { cartState, ABANDONED_AFTER_HOURS } from "@/lib/savedCart";

const PAGE_SIZE = 20;

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "carts"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state") || "abandoned";
    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
    const now = Date.now();
    const cutoff = new Date(now - ABANDONED_AFTER_HOURS * 3600_000);

    // Recoveries are history, not baskets: they come from their own
    // records, which nothing overwrites when the customer shops again.
    if (state === "recovered") {
      return NextResponse.json({ success: true, data: await recoveredPage(page, cutoff) });
    }

    // Narrowed in the database rather than by loading every cart and
    // filtering in Node — this list is meant to still work at ten thousand
    // customers.
    const query =
      state === "reminded"
        ? { reminderSentAt: { $ne: null }, "items.0": { $exists: true } }
        : state === "active"
        ? { "items.0": { $exists: true }, lastActivityAt: { $gt: cutoff } }
        : // "Abandoned" is the work queue: quiet, still full, and not yet
          // written to. Once a reminder has gone out the basket belongs to
          // the Reminded tab, or this list would never empty.
          { "items.0": { $exists: true }, lastActivityAt: { $lte: cutoff }, reminderSentAt: null };

    const [carts, total] = await Promise.all([
      Cart.find(query).sort({ lastActivityAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Cart.countDocuments(query),
    ]);

    const users = await User.find({ _id: { $in: carts.map((c) => c.user) } })
      .select("name email emailPrefs")
      .lean();
    const byUser = new Map(users.map((u) => [String(u._id), u]));

    const rows = await Promise.all(
      carts.map(async (cart) => {
        const checked = cart.items.length
          ? await revalidateCart(cart.items.map((i) => ({ ...i, product: String(i.product) })))
          : { items: [] };
        const buyable = checked.items.filter((l) => l.quantity > 0);
        const user = byUser.get(String(cart.user));

        return {
          _id: String(cart._id),
          customer: user ? { name: user.name, email: user.email } : null,
          optedOut: user?.emailPrefs?.cartReminders === false,
          state: cartState(cart, { now }),
          items: buyable.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price, image: l.image })),
          // Lines still in the basket that nobody can buy any more — the
          // reason a reminder may refuse to go out.
          unavailable: checked.items.length - buyable.length,
          value: buyable.reduce((sum, l) => sum + l.price * l.quantity, 0),
          lastActivityAt: cart.lastActivityAt,
          reminderSentAt: cart.reminderSentAt,
          reminderCount: cart.reminderCount || 0,
          reminderValue: cart.reminderValue || 0,
          reminderItemCount: cart.reminderItemCount || 0,
          recoveredAt: null,
          recoveredOrder: null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        rows,
        page,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        summary: await summaryFigures(cutoff),
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/carts");
  }
}

/**
 * Headline numbers for the whole shop, not just this page — a page of
 * twenty tells an owner nothing about how much is sitting in baskets.
 *
 * "Reminded" counts emails that actually went out, and "recovered" counts
 * orders that followed one. Neither is an estimate.
 */
async function summaryFigures(cutoff) {
  const [abandoned, reminded, recovered] = await Promise.all([
    // Counts exactly what the Abandoned tab lists, so the headline figure
    // and the list below it can never disagree.
    Cart.countDocuments({ "items.0": { $exists: true }, lastActivityAt: { $lte: cutoff }, reminderSentAt: null }),
    // Baskets still carrying a reminder, plus the ones whose reminder
    // ended in an order — the cart's own counter is cleared when it does.
    Cart.countDocuments({ reminderSentAt: { $ne: null } }),
    CartRecovery.aggregate([{ $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$value" } } }]),
  ]);

  const recoveredCount = recovered[0]?.count || 0;

  return {
    abandoned,
    reminded: reminded + recoveredCount,
    recovered: recoveredCount,
    recoveredValue: recovered[0]?.value || 0,
    abandonedAfterHours: ABANDONED_AFTER_HOURS,
  };
}

/** The Recovered tab: baskets that were reminded and then bought. */
async function recoveredPage(page, cutoff) {
  const [recoveries, total] = await Promise.all([
    CartRecovery.find().sort({ recoveredAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    CartRecovery.countDocuments(),
  ]);

  const [users, orders] = await Promise.all([
    User.find({ _id: { $in: recoveries.map((r) => r.user) } }).select("name email emailPrefs").lean(),
    Order.find({ _id: { $in: recoveries.map((r) => r.order) } }).select("orderNumber totalAmount").lean(),
  ]);
  const byUser = new Map(users.map((u) => [String(u._id), u]));
  const byOrder = new Map(orders.map((o) => [String(o._id), o]));

  const rows = recoveries.map((r) => {
    const user = byUser.get(String(r.user));
    const order = byOrder.get(String(r.order));
    return {
      _id: String(r._id),
      customer: user ? { name: user.name, email: user.email } : null,
      optedOut: user?.emailPrefs?.cartReminders === false,
      state: "recovered",
      items: [],
      unavailable: 0,
      value: 0,
      lastActivityAt: r.recoveredAt,
      reminderSentAt: r.remindedAt,
      reminderCount: 1,
      reminderValue: r.value,
      reminderItemCount: r.itemCount,
      recoveredAt: r.recoveredAt,
      recoveredOrder: order
        ? { _id: String(order._id), orderNumber: order.orderNumber, totalAmount: order.totalAmount }
        : null,
    };
  });

  return { rows, page, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), summary: await summaryFigures(cutoff) };
}
