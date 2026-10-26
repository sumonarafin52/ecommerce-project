// app/api/admin/notifications/test/route.js
//
// Sends one real message to an address or number the admin supplies.
//
// Configuring a gateway and finding out it never worked when a customer
// complains is the failure mode this exists to prevent. It reports exactly
// what the provider said back, including the rejection text — most SMS
// gateways answer HTTP 200 with the real error in the body.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { sendEmail } from "@/lib/email";
import { sendSms, normalizePhone } from "@/lib/notifications/sms";
import { emailTemplate, storeDetailsForEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    // Each test costs real money on SMS and real reputation on email, and
    // this endpoint sends to an arbitrary recipient — so it's capped.
    const limit = await rateLimit(`notify-test:${session.user.id}`, { max: 10, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many test messages — wait a few minutes." },
        { status: 429 }
      );
    }

    const body = (await request.json()) || {};
    const channel = body.channel === "sms" ? "sms" : "email";
    const to = String(body.to || "").trim().slice(0, 120);
    if (!to) {
      return NextResponse.json(
        { success: false, message: channel === "sms" ? "Enter a phone number" : "Enter an email address" },
        { status: 400 }
      );
    }

    const store = await storeDetailsForEmail();
    const title = "Test notification";
    const message = `This is a test from ${store.storeName || "your store"}. If you're reading it, ${
      channel === "sms" ? "SMS" : "email"
    } is working.`;

    if (channel === "sms") {
      const res = await sendSms({ to, text: message });
      return NextResponse.json({
        success: !!res.sent,
        message: res.sent
          ? `Sent to ${normalizePhone(to)}.`
          : `Not sent: ${res.reason}`,
        // the gateway's own words, so a rejection can be diagnosed
        detail: res.reason || "",
      });
    }

    const res = await sendEmail({
      to,
      subject: title,
      html: emailTemplate({ title, message, store }),
    });
    return NextResponse.json({
      success: !!res.sent,
      message: res.sent ? `Sent to ${to}.` : `Not sent: ${res.reason}`,
      detail: res.reason || "",
    });
  } catch (error) {
    return serverError(error, "api/admin/notifications/test");
  }
}
