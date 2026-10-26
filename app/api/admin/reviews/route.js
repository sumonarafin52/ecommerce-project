// app/api/admin/reviews/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Review from "@/models/Review";
import { hasPermission } from "@/lib/rbac";
import { recalcProductRating } from "@/lib/productRating";
import { serverError } from "@/lib/apiError";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Reviews belong to the catalogue, so the "products" permission governs them.
async function staffOnly() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(await hasPermission(session, "products"))) return null;
  return session;
}

export async function GET(request) {
  try {
    await connectDB();
    const session = await staffOnly();
    if (!session) return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const rating = parseInt(searchParams.get("rating"), 10);

    const query = {};
    if (status === "published" || status === "hidden") query.status = status;
    if (rating >= 1 && rating <= 5) query.rating = rating;
    if (searchParams.get("unanswered") === "1") query.reply = "";
    // Customer-reported reviews an admin hasn't ruled on yet. Reports never
    // hide a review by themselves — they only queue it for a human.
    if (searchParams.get("reported") === "1") {
      query["reports.0"] = { $exists: true };
      query.reportsResolvedAt = null;
    }

    const reviews = await Review.find(query)
      .populate("product", "name slug images")
      .populate("user", "name email")
      .populate("reports.user", "name email")
      .sort(searchParams.get("reported") === "1" ? { "reports.0.at": -1 } : { createdAt: -1 })
      .limit(200)
      .lean();

    const [counts, reportedCount] = await Promise.all([
      Review.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      Review.countDocuments({ "reports.0": { $exists: true }, reportsResolvedAt: null }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        reviews: reviews.map((r) => ({
          ...r,
          helpfulCount: Array.isArray(r.helpfulVotes) ? r.helpfulVotes.length : 0,
          // who voted is not an admin's business either — only how many
          helpfulVotes: undefined,
          reports: (r.reports || []).map((rep) => ({
            reason: rep.reason,
            note: rep.note,
            at: rep.at,
            by: rep.user?.name || "Deleted account",
          })),
        })),
        counts: Object.fromEntries(counts.map((c) => [c._id || "published", c.n])),
        reportedCount,
      },
    });
  } catch (error) {
    return serverError(error, "api/admin/reviews");
  }
}

// PUT { id, status?, reply? }
export async function PUT(request) {
  try {
    await connectDB();
    const session = await staffOnly();
    if (!session) return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });

    const { id, status, reply, dismissReports } = (await request.json()) || {};
    if (!/^[0-9a-fA-F]{24}$/.test(String(id || ""))) {
      return NextResponse.json({ success: false, message: "Invalid review" }, { status: 400 });
    }
    const review = await Review.findById(id);
    if (!review) return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });

    let visibilityChanged = false;
    if (status !== undefined) {
      if (!["published", "hidden"].includes(status)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      visibilityChanged = review.status !== status;
      review.status = status;
    }

    // "Keep this review" — the admin has looked at the reports and decided
    // the review stands. The reports stay on the record (so a pattern of
    // mass-reporting is still visible); they just leave the queue.
    if (dismissReports === true) {
      review.reportsResolvedAt = new Date();
    }

    if (reply !== undefined) {
      if (typeof reply !== "string" || reply.length > 1000) {
        return NextResponse.json({ success: false, message: "Reply must be under 1000 characters" }, { status: 400 });
      }
      const text = reply.trim();
      review.reply = text;
      review.repliedBy = text ? session.user.name || "Store" : "";
      review.repliedAt = text ? new Date() : null;
    }

    await review.save();
    // a hidden review must stop counting toward the product's score
    if (visibilityChanged) await recalcProductRating(review.product);

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    return serverError(error, "api/admin/reviews:put");
  }
}

// DELETE ?id=...
export async function DELETE(request) {
  try {
    await connectDB();
    const session = await staffOnly();
    if (!session) return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });

    const id = new URL(request.url).searchParams.get("id");
    if (!/^[0-9a-fA-F]{24}$/.test(String(id || ""))) {
      return NextResponse.json({ success: false, message: "Invalid review" }, { status: 400 });
    }
    const review = await Review.findById(id);
    if (!review) return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });

    const productId = review.product;
    await review.deleteOne();
    await recalcProductRating(productId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error, "api/admin/reviews:delete");
  }
}
