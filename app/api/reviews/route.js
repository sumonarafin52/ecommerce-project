// app/api/reviews/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Review from "@/models/Review";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";
import { recalcProductRating } from "@/lib/productRating";
import { findReviewableOrder, notEligibleMessage } from "@/lib/reviewEligibility";
import { productRequiresShipping } from "@/lib/shippingRequirement";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product");
    if (!productId) {
      return NextResponse.json({ success: false, message: "Product id required" }, { status: 400 });
    }

    const sort = searchParams.get("sort") || "helpful";
    const session = await getServerSession(authOptions);

    const reviews = await Review.find({ status: { $ne: "hidden" }, product: productId })
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .lean();

    // Reviews are shaped before they leave the server. The raw documents
    // carry the ids of everyone who voted a review helpful and everyone who
    // reported it — neither is any visitor's business.
    const viewerId = session?.user?.id ? String(session.user.id) : "";
    const shaped = reviews.map((r) => ({
      _id: String(r._id),
      user: r.user ? { _id: String(r.user._id), name: r.user.name } : null,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      verifiedPurchase: r.verifiedPurchase !== false,
      reply: r.reply || "",
      repliedBy: r.repliedBy || "",
      repliedAt: r.repliedAt || null,
      helpfulCount: Array.isArray(r.helpfulVotes) ? r.helpfulVotes.length : 0,
      // so the button can show the viewer's own vote without revealing anyone else's
      viewerFoundHelpful: viewerId ? (r.helpfulVotes || []).some((id) => String(id) === viewerId) : false,
      viewerIsAuthor: viewerId ? String(r.user?._id) === viewerId : false,
      viewerReported: viewerId ? (r.reports || []).some((rep) => String(rep.user) === viewerId) : false,
    }));

    if (sort === "helpful") {
      // most helpful first, newest breaking ties — a brand-new review with no
      // votes yet shouldn't sink below an old one that also has none
      shaped.sort((a, b) => b.helpfulCount - a.helpfulCount || new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "highest") {
      shaped.sort((a, b) => b.rating - a.rating || new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "lowest") {
      shaped.sort((a, b) => a.rating - b.rating || new Date(b.createdAt) - new Date(a.createdAt));
    }
    // "recent" is the order they already came back in

    return NextResponse.json({ success: true, data: shaped });
  } catch (error) {
    return serverError(error, "api/reviews");
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const { product, rating, comment } = await request.json();
    if (!product || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, message: "Valid rating (1-5) required" }, { status: 400 });
    }

    // VERIFIED PURCHASE. What counts as "received" depends on the product:
    // a shipped item needs a delivered order, a download needs a paid one.
    // The old rule required orderStatus "delivered" for everything, which
    // made digital products permanently un-reviewable.
    const productDoc = await Product.findById(product).select("digitalProduct shippingRequirement").lean();
    if (!productDoc) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }
    const order = await findReviewableOrder({ userId: session.user.id, productId: product });
    if (!order) {
      return NextResponse.json(
        { success: false, message: notEligibleMessage(productRequiresShipping(productDoc)) },
        { status: 400 }
      );
    }

    // ek product e ek user ekbar e
    const existing = await Review.findOne({ product, user: session.user.id });
    if (existing) {
      return NextResponse.json({ success: false, message: "You already reviewed this product" }, { status: 400 });
    }

    const review = await Review.create({
      product,
      user: session.user.id,
      order: order._id,
      rating,
      comment: comment || "",
      verifiedPurchase: true,
    });

    // order reviewed flag
    order.reviewed = true;
    await order.save();

    // recompute the product's rating (published reviews only)
    await recalcProductRating(product);

    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (error) {
    return serverError(error, "api/reviews");
  }
}