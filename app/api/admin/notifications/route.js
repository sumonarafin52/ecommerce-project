// app/api/admin/notifications/route.js
//
// The delivery log: what the store sent, over which channel, and whether it
// arrived. This is the answer to "the customer says they never got the
// shipping notification" — previously there was nothing to look at.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import NotificationLog from "@/models/NotificationLog";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

const PAGE_SIZE = 40;

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");
    const onlyFailed = url.searchParams.get("failed") === "1";
    const page = Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1);

    const filter = {};
    if (["inApp", "email", "sms"].includes(channel)) filter.channel = channel;
    if (onlyFailed) filter.sent = false;

    const [total, rows, failedCount] = await Promise.all([
      NotificationLog.countDocuments(filter),
      NotificationLog.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      // Only recent failures: a problem from three months ago isn't news.
      NotificationLog.countDocuments({ sent: false, at: { $gte: new Date(Date.now() - 7 * 86_400_000) } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rows: rows.map((r) => ({
          id: String(r._id),
          event: r.event,
          channel: r.channel,
          recipient: r.recipient,
          title: r.title,
          sent: r.sent,
          reason: r.reason,
          at: r.at,
        })),
        total,
        page,
        pages: Math.ceil(total / PAGE_SIZE),
        failedLast7Days: failedCount,
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/notifications");
  }
}
