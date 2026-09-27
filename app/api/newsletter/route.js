// app/api/newsletter/route.js
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import NewsletterSubscriber from "@/models/NewsletterSubscriber";
import { hasPermission } from "@/lib/rbac";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { validateEmail } from "@/lib/authValidation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// POST { email, source }
export async function POST(request) {
  try {
    const { email, source = "footer", website } = (await request.json()) || {};
    // honeypot
    if (website) return NextResponse.json({ success: true, message: "You're subscribed!" });

    const emailError = validateEmail(email);
    if (emailError) return NextResponse.json({ success: false, message: emailError }, { status: 400 });

    const limit = await rateLimit(`newsletter:${getClientIp(request)}`, { max: 8, windowMs: 60 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many attempts — please try again later." }, { status: 429 });
    }

    await connectDB();
    const normalized = email.trim().toLowerCase();
    // Upsert: a new address is created; a previously-unsubscribed one is
    // reactivated (they've just explicitly asked to join again). The
    // response is identical either way, so this can't be used to discover
    // who is on the list.
    await NewsletterSubscriber.updateOne(
      { email: normalized },
      {
        $set: { status: "subscribed", unsubscribedAt: null },
        $setOnInsert: {
          email: normalized,
          source: String(source).slice(0, 30),
          unsubscribeToken: crypto.randomBytes(24).toString("hex"),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, message: "You're subscribed! Watch your inbox for deals." });
  } catch (error) {
    console.error("[newsletter:subscribe]", error);
    return NextResponse.json({ success: false, message: "Couldn't subscribe you right now. Please try again." }, { status: 500 });
  }
}

// GET ?format=csv — staff only
export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "customers"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const format = new URL(request.url).searchParams.get("format");
    const subscribers = await NewsletterSubscriber.find({ status: "subscribed" })
      .select(format === "csv" ? "email source createdAt unsubscribeToken" : "email source createdAt")
      .sort({ createdAt: -1 })
      .lean();

    if (format === "csv") {
      // quote every field and neutralise spreadsheet formula injection
      const cell = (v) => {
        let s = String(v ?? "");
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
      };
      // include each subscriber's own unsubscribe link, ready to merge into
      // campaign emails from any email tool
      const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
      const rows = [["email", "source", "subscribed_at", "unsubscribe_url"].map(cell).join(",")];
      for (const s of subscribers) {
        rows.push(
          [s.email, s.source, new Date(s.createdAt).toISOString(), `${origin}/unsubscribe?token=${s.unsubscribeToken}`]
            .map(cell)
            .join(",")
        );
      }
      return new NextResponse(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const unsubscribed = await NewsletterSubscriber.countDocuments({ status: "unsubscribed" });
    return NextResponse.json({ success: true, data: { subscribers, unsubscribed } });
  } catch (error) {
    console.error("[newsletter:list]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
