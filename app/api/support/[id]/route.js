// app/api/support/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import SupportTicket from "@/models/SupportTicket";
import { hasPermission } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import { notify } from "@/lib/notify";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// PUT { reply?, status? }
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "customers"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return NextResponse.json({ success: false, message: "Invalid ticket" }, { status: 400 });
    }

    const { reply, status } = (await request.json()) || {};
    const ticket = await SupportTicket.findById(params.id);
    if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });

    if (reply !== undefined) {
      if (typeof reply !== "string" || reply.trim().length < 2 || reply.length > 5000) {
        return NextResponse.json({ success: false, message: "Reply must be 2–5000 characters" }, { status: 400 });
      }
      const text = reply.trim();
      ticket.messages.push({ from: "staff", authorName: session.user.name || "Support", body: text });
      ticket.status = "answered";

      sendEmail({
        to: ticket.email,
        subject: `Re: ${ticket.subject} [${ticket.ticketNumber}]`,
        html: `
          <div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <p style="color:#2B2318;font-size:14px;">Hi ${escapeHtml(ticket.name)},</p>
            <div style="color:#2B2318;font-size:14px;line-height:1.7;white-space:pre-line;">${escapeHtml(text)}</div>
            <p style="color:#8C8168;font-size:12px;margin-top:24px;">Reference ${ticket.ticketNumber} — reply by contacting us again and quote this number.</p>
          </div>`,
      }).catch(() => {});

      if (ticket.user) {
        notify({
          user: ticket.user,
          type: "support",
          title: "Support replied",
          message: `We've replied to "${ticket.subject}". Check your email for the full message.`,
          link: "/contact",
        });
      }
    }

    if (status !== undefined) {
      if (!["open", "answered", "closed"].includes(status)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      ticket.status = status;
    }

    await ticket.save();
    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[support:update]", error);
    return NextResponse.json({ success: false, message: "Couldn't update the ticket" }, { status: 500 });
  }
}
