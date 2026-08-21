// app/api/settings/email-test/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { to } = await request.json();
    const recipient = to || session.user.email;
    if (!recipient) {
      return NextResponse.json({ success: false, message: "No recipient email available" }, { status: 400 });
    }

    const result = await sendEmail({
      to: recipient,
      subject: "Test email from your store",
      html: `<div style="font-family: Arial, sans-serif; padding: 24px;"><h2>It works! 🎉</h2><p>This is a test email — your SMTP settings are configured correctly.</p></div>`,
    });

    if (!result.sent) {
      return NextResponse.json({ success: false, message: result.reason || "Failed to send test email" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Test email sent to ${recipient}` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
