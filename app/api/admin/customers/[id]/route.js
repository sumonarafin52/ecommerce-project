// app/api/admin/customers/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Order from "@/models/Order";
import Address from "@/models/Address";
import ReturnRequest from "@/models/ReturnRequest";
import SupportTicket from "@/models/SupportTicket";
import { hasPermission } from "@/lib/rbac";
import { serverError } from "@/lib/apiError";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Same definition the Reports page uses: money received, minus refunds.
const PAID = ["paid", "refunded"];

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "customers"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }
    const userId = new mongoose.Types.ObjectId(params.id);

    const customer = await User.findById(userId).select("name email role createdAt").lean();
    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    const [totals, statusRows, orders, addresses, returnCount, ticketCount] = await Promise.all([
      Order.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            spent: {
              $sum: {
                $cond: [
                  { $in: ["$paymentStatus", PAID] },
                  { $subtract: ["$totalAmount", { $ifNull: ["$refund.amount", 0] }] },
                  0,
                ],
              },
            },
            paidOrders: { $sum: { $cond: [{ $in: ["$paymentStatus", PAID] }, 1, 0] } },
            lastOrderAt: { $max: "$createdAt" },
          },
        },
      ]),
      Order.aggregate([{ $match: { user: userId } }, { $group: { _id: "$orderStatus", n: { $sum: 1 } } }]),
      Order.find({ user: userId })
        .select("orderNumber totalAmount orderStatus paymentStatus paymentMethod createdAt items")
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
      Address.find({ user: userId }).lean(),
      ReturnRequest.countDocuments({ user: userId }),
      SupportTicket.countDocuments({ user: userId }),
    ]);

    const t = totals[0] || {};
    return NextResponse.json({
      success: true,
      data: {
        customer,
        stats: {
          orders: t.orders || 0,
          paidOrders: t.paidOrders || 0,
          spent: t.spent || 0,
          avgOrder: t.paidOrders ? (t.spent || 0) / t.paidOrders : 0,
          lastOrderAt: t.lastOrderAt || null,
          returns: returnCount,
          tickets: ticketCount,
        },
        statusCounts: Object.fromEntries(statusRows.map((r) => [r._id || "unknown", r.n])),
        orders: orders.map((o) => ({ ...o, itemCount: (o.items || []).reduce((n, i) => n + i.quantity, 0), items: undefined })),
        addresses,
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/customers/[id]");
  }
}
