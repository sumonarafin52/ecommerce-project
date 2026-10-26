// app/api/admin/carts/sweep/route.js
//
// Sends every reminder that is due.
//
// This is the automatic half of basket recovery, and it is deliberately a
// plain endpoint rather than a background timer inside the app: a Next.js
// server can be running in several instances, or be asleep between
// requests, so a setInterval() would either never fire or fire once per
// instance. Something outside the app has to decide when "now" is.
//
// Two callers are allowed, and nobody else:
//   - a signed-in staff account with the baskets permission (the "Send all
//     due" button)
//   - a scheduler presenting CART_SWEEP_SECRET as a bearer token
//
// Without CART_SWEEP_SECRET set, the scheduled route is closed entirely —
// it does not fall back to "no auth required", which would leave anyone on
// the internet able to make the shop mail its customers. DEPLOYMENT.md has
// the cron line.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";
import { sendDueReminders } from "@/lib/cartReminder";

/** Constant-time compare, so the secret can't be guessed character by character. */
function secretMatches(presented) {
  const expected = process.env.CART_SWEEP_SECRET || "";
  if (!expected || !presented) return false;
  const a = Buffer.from(String(presented));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  try {
    await connectDB();

    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    let allowedBy = secretMatches(bearer) ? "schedule" : "";

    if (!allowedBy) {
      const session = await getServerSession(authOptions);
      if (session?.user && (await hasPermission(session, "carts"))) allowedBy = "staff";
    }

    if (!allowedBy) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const result = await sendDueReminders({ limit: 100 });

    // The per-cart detail is useful to a scheduler's log and to staff
    // watching a button; it names no customer.
    return NextResponse.json({
      success: true,
      data: { considered: result.considered, sent: result.sent, by: allowedBy },
    });
  } catch (error) {
    return serverError(error, "api/admin/carts/sweep");
  }
}
