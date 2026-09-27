// app/api/returns/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import ReturnRequest, { RETURN_TRANSITIONS } from "@/models/ReturnRequest";
import { hasPermission } from "@/lib/rbac";
import { adjustStock } from "@/lib/productStock";
import { notifyBackInStock } from "@/lib/inventoryEvents";
import { notify } from "@/lib/notify";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const CUSTOMER_MESSAGES = {
  approved: (n) => `Your return for order #${n} was approved. Please send the item(s) back — we'll refund you once they arrive.`,
  rejected: (n) => `Your return request for order #${n} wasn't approved.`,
  received: (n) => `We've received your returned item(s) for order #${n}. Your refund is being processed.`,
  refunded: (n) => `Your refund for the return on order #${n} has been issued.`,
};

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "orders_update"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return NextResponse.json({ success: false, message: "Invalid return" }, { status: 400 });
    }

    const { status, adminNote } = (await request.json()) || {};
    const ret = await ReturnRequest.findById(params.id);
    if (!ret) return NextResponse.json({ success: false, message: "Return not found" }, { status: 404 });

    if (typeof adminNote === "string") ret.adminNote = adminNote.slice(0, 1000);

    if (status && status !== ret.status) {
      if (!(RETURN_TRANSITIONS[ret.status] || []).includes(status)) {
        return NextResponse.json(
          { success: false, message: `Can't move a return from "${ret.status}" to "${status}"` },
          { status: 400 }
        );
      }

      // Stock only comes back once the goods are physically in hand — not on
      // approval, when they're still with the customer. stockRestored makes
      // this idempotent even if "received" were ever applied twice.
      if (status === "received" && !ret.stockRestored) {
        await adjustStock(ret.items, 1);
        ret.stockRestored = true;
        for (const it of ret.items) notifyBackInStock(it.product);
      }

      ret.status = status;
      ret.history.push({ status, note: ret.adminNote || "", by: session.user.name || "Staff" });

      const order = await Order.findById(ret.order);
      if (order) {
        order.activity.push({
          type: "return_" + status,
          message: `Return ${status}${ret.adminNote ? `: ${ret.adminNote}` : ""}`,
          by: { id: session.user.id, name: session.user.name },
          at: new Date(),
        });

        // Once every unit of every item has come back, the order as a whole
        // is returned.
        if (status === "received") {
          const received = await ReturnRequest.find({
            order: order._id,
            status: { $in: ["received", "refunded"] },
          }).lean();
          const back = new Map();
          for (const r of [...received.filter((r) => String(r._id) !== String(ret._id)), ret]) {
            for (const it of r.items) {
              const k = `${it.product}::${it.combinationKey || ""}`;
              back.set(k, (back.get(k) || 0) + it.quantity);
            }
          }
          const fullyReturned = order.items.every(
            (l) => (back.get(`${l.product}::${l.combinationKey || ""}`) || 0) >= l.quantity
          );
          if (fullyReturned && order.orderStatus === "delivered") order.orderStatus = "returned";
        }
        await order.save();
      }

      notify({
        user: ret.user,
        type: "return",
        title: `Return ${status}`,
        message: CUSTOMER_MESSAGES[status](ret.orderNumber),
        link: "/profile",
      });
    }

    await ret.save();
    return NextResponse.json({ success: true, data: ret });
  } catch (error) {
    console.error("[returns:update]", error);
    return NextResponse.json({ success: false, message: "Couldn't update the return" }, { status: 500 });
  }
}
