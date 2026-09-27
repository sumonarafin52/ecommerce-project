// app/api/newsletter/unsubscribe/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import NewsletterSubscriber from "@/models/NewsletterSubscriber";

// POST { token }
export async function POST(request) {
  try {
    const { token } = (await request.json()) || {};
    if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) {
      return NextResponse.json({ success: false, message: "This unsubscribe link isn't valid." }, { status: 400 });
    }
    await connectDB();
    const res = await NewsletterSubscriber.updateOne(
      { unsubscribeToken: token },
      { $set: { status: "unsubscribed", unsubscribedAt: new Date() } }
    );
    if (res.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "This unsubscribe link isn't valid." }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "You've been unsubscribed." });
  } catch (error) {
    console.error("[newsletter:unsubscribe]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
