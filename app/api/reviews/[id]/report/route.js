// app/api/reviews/[id]/report/route.js
//
// Lets a customer report a review for an admin to look at.
//
// Deliberately does NOT hide the review on a report count. Auto-hiding on
// "3 reports" means a handful of accounts can bury an honest one-star review,
// which is exactly the outcome review moderation is supposed to prevent. A
// report raises it in the admin queue; a person decides.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Review from "@/models/Review";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isObjectId } from "@/lib/digitalDelivery";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

const REASONS = ["spam", "offensive", "off_topic", "fake", "other"];

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Sign in to report a review" }, { status: 401 });
    }
    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    // One account mass-reporting every review is itself the abuse case.
    const limit = await rateLimit(`review-report:${session.user.id || getClientIp(request)}`, {
      max: 10,
      windowMs: 60 * 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "You've reported several reviews recently. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = REASONS.includes(body.reason) ? body.reason : "other";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

    const review = await Review.findById(params.id).select("reports status user");
    if (!review || review.status === "hidden") {
      // Already hidden: nothing to report, and saying so would confirm the
      // review exists to someone who can't see it.
      return NextResponse.json({ success: true, message: "Thanks — we'll take a look." });
    }

    const already = (review.reports || []).some((r) => String(r.user) === String(session.user.id));
    if (already) {
      // Same answer as a fresh report, so repeat-reporting reveals nothing
      // and the customer isn't told off for forgetting.
      return NextResponse.json({ success: true, message: "Thanks — we'll take a look." });
    }

    await Review.updateOne(
      { _id: params.id },
      {
        $push: { reports: { user: session.user.id, reason, note, at: new Date() } },
        // a new report reopens the review even if an admin had cleared it
        $set: { reportsResolvedAt: null },
      }
    );

    return NextResponse.json({ success: true, message: "Thanks — we'll take a look." });
  } catch (error) {
    return serverError(error, "api/reviews/report");
  }
}
