// app/api/account/email-prefs/route.js
//
// What a customer is willing to be emailed about, beyond the messages that
// belong to something they did.
//
// Two ways in, because somebody acting on an email they received is rarely
// signed in on the device they are reading it on:
//   - a signed-in customer changing it from their profile
//   - a signed link from inside a reminder, which proves who it is without
//     a password (lib/signedLink.js)
//
// The token path can only ever turn reminders OFF. A link that could turn
// them back on would be a link that re-subscribes somebody who clicked
// "stop", and tokens travel through inboxes and forwarded mail.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { verifyLink } from "@/lib/signedLink";
import { serverError } from "@/lib/apiError";

const OPT_OUT_PURPOSE = "cart_reminders_off";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    const user = await User.findById(session.user.id).select("emailPrefs").lean();
    return NextResponse.json({
      success: true,
      data: { cartReminders: user?.emailPrefs?.cartReminders !== false },
    });
  } catch (error) {
    return serverError(error, "api/account/email-prefs");
  }
}

export async function PUT(request) {
  try {
    await connectDB();
    const body = (await request.json().catch(() => ({}))) || {};

    // ---- from a reminder email ----------------------------------------
    if (body.token) {
      const link = verifyLink(body.token, OPT_OUT_PURPOSE);
      if (!link) {
        return NextResponse.json(
          { success: false, message: "That link has expired. Sign in and change it from your profile." },
          { status: 400 }
        );
      }

      const updated = await User.findByIdAndUpdate(link.subject, { $set: { "emailPrefs.cartReminders": false } });
      if (!updated) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });

      return NextResponse.json({ success: true, message: "Basket reminders are off. You'll still get order emails." });
    }

    // ---- from the customer's own profile ------------------------------
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    if (typeof body.cartReminders !== "boolean") {
      return NextResponse.json({ success: false, message: "cartReminders must be true or false" }, { status: 400 });
    }

    await User.findByIdAndUpdate(session.user.id, { $set: { "emailPrefs.cartReminders": body.cartReminders } });

    return NextResponse.json({
      success: true,
      message: body.cartReminders ? "Basket reminders are on." : "Basket reminders are off.",
    });
  } catch (error) {
    return serverError(error, "api/account/email-prefs");
  }
}
