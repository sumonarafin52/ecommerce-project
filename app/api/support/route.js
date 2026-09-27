// app/api/support/route.js
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import SupportTicket, { TICKET_CATEGORIES } from "@/models/SupportTicket";
import { hasPermission } from "@/lib/rbac";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { validateEmail, validateName } from "@/lib/authValidation";
import { sendEmail } from "@/lib/email";
import { notify } from "@/lib/notify";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// GET — staff (customers permission) see all tickets; customers see their own
export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const isStaff = await hasPermission(session, "customers");
    const query = isStaff && searchParams.get("scope") === "all" ? {} : { user: session.user.id };
    const status = searchParams.get("status");
    if (status && ["open", "answered", "closed"].includes(status)) query.status = status;

    const tickets = await SupportTicket.find(query).sort({ updatedAt: -1 }).limit(200).lean();
    return NextResponse.json({ success: true, data: tickets });
  } catch (error) {
    console.error("[support:get]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// POST { name, email, phone, category, subject, orderNumber, message, website }
export async function POST(request) {
  try {
    const body = (await request.json()) || {};

    // Honeypot: a field hidden from humans with CSS. Bots filling every
    // input fill this too. Pretend success so they don't adapt.
    if (body.website) {
      return NextResponse.json({ success: true, data: { ticketNumber: "RECEIVED" } });
    }

    const { name, email, phone = "", category, subject, orderNumber = "", message } = body;

    const nameError = validateName(name);
    if (nameError) return NextResponse.json({ success: false, message: nameError }, { status: 400 });
    const emailError = validateEmail(email);
    if (emailError) return NextResponse.json({ success: false, message: emailError }, { status: 400 });
    if (!Object.prototype.hasOwnProperty.call(TICKET_CATEGORIES, category)) {
      return NextResponse.json({ success: false, message: "Please choose a topic" }, { status: 400 });
    }
    if (typeof subject !== "string" || subject.trim().length < 3 || subject.length > 150) {
      return NextResponse.json({ success: false, message: "Subject must be 3–150 characters" }, { status: 400 });
    }
    if (typeof message !== "string" || message.trim().length < 10 || message.length > 5000) {
      return NextResponse.json({ success: false, message: "Message must be 10–5000 characters" }, { status: 400 });
    }
    if (typeof phone !== "string" || phone.length > 30 || typeof orderNumber !== "string" || orderNumber.length > 40) {
      return NextResponse.json({ success: false, message: "Invalid phone or order number" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ip = getClientIp(request);
    const ipLimit = await rateLimit(`support-ip:${ip}`, { max: 6, windowMs: 60 * 60_000 });
    const emailLimit = await rateLimit(`support-email:${normalizedEmail}`, { max: 5, windowMs: 60 * 60_000 });
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "You've sent several messages recently — we'll reply to those first. Please try again later." },
        { status: 429 }
      );
    }

    await connectDB();
    const session = await getServerSession(authOptions);

    const ticket = await SupportTicket.create({
      ticketNumber: `T-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      user: session?.user?.id || null,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      category,
      subject: subject.trim(),
      orderNumber: orderNumber.trim(),
      messages: [{ from: "customer", authorName: name.trim(), body: message.trim() }],
    });

    // receipt to the customer (background — never delays the response)
    sendEmail({
      to: normalizedEmail,
      subject: `We got your message [${ticket.ticketNumber}]`,
      html: `
        <div style="font-family:-apple-system,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1E3A5F;margin:0 0 12px;">Thanks, ${escapeHtml(name.trim())} — we've got your message</h2>
          <p style="color:#2B2318;font-size:14px;line-height:1.6;">Your reference is <b>${ticket.ticketNumber}</b>. We'll reply to this email address as soon as we can.</p>
          <p style="color:#8C8168;font-size:13px;line-height:1.6;border-left:3px solid #E7DAB9;padding-left:12px;">${escapeHtml(subject.trim())}</p>
        </div>`,
    }).catch(() => {});

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const a of admins) {
      notify({
        user: a._id,
        type: "support",
        title: "New support message",
        message: `${name.trim()}: ${subject.trim()}`,
        link: "/admin/support",
      });
    }

    return NextResponse.json({ success: true, data: { ticketNumber: ticket.ticketNumber } }, { status: 201 });
  } catch (error) {
    console.error("[support:create]", error);
    return NextResponse.json({ success: false, message: "Couldn't send your message. Please try again." }, { status: 500 });
  }
}
