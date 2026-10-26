// app/api/admin/carts/[id]/remind/route.js
//
// "Send reminder" on one basket.
//
// The button is wired to a real send: the email goes out through notify()
// and is written to the delivery log, and the basket records that it was
// reminded. When it does NOT send, the reason comes back and is shown —
// an opted-out customer or a basket of sold-out items must look different
// from a message that went out.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";
import { sendCartReminder, SKIP } from "@/lib/cartReminder";
import { rateLimit } from "@/lib/rateLimit";

const REASONS = {
  [SKIP.NO_CART]: "That basket no longer exists.",
  [SKIP.NO_EMAIL]: "This customer has no email address on file.",
  [SKIP.OPTED_OUT]: "This customer has turned basket reminders off.",
  [SKIP.NOTHING_BUYABLE]: "Nothing in this basket can be bought right now — no reminder sent.",
  [SKIP.NOT_DUE]: "This basket has already had its reminder.",
  [SKIP.EMAIL_OFF]: "Email is switched off for basket reminders — turn it on in Settings → Notifications.",
  [SKIP.EMAIL_FAILED]: "The email could not be sent. Check Settings → Notifications for the delivery log.",
};

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "carts"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    // A staff account is trusted, but a stuck finger on a button should not
    // be able to mail a hundred customers in a minute.
    const limited = await rateLimit(`cart-remind:${session.user.id}`, { max: 30, windowMs: 60_000 });
    if (!limited.allowed) {
      return NextResponse.json({ success: false, message: "Too many reminders at once — wait a minute." }, { status: 429 });
    }

    const result = await sendCartReminder(params.id, { force: true });

    if (!result.sent) {
      return NextResponse.json(
        { success: false, message: REASONS[result.reason] || "Reminder not sent.", reason: result.reason },
        { status: result.reason === SKIP.NO_CART ? 404 : 409 }
      );
    }

    return NextResponse.json({ success: true, message: "Reminder sent." });
  } catch (error) {
    return serverError(error, "api/admin/carts/remind");
  }
}
