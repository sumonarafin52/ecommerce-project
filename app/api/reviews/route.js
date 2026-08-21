// app/api/reviews/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Review from "@/models/Review";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product");
    if (!productId) {
      return NextResponse.json({ success: false, message: "Product id required" }, { status: 400 });
    }

    const reviews = await Review.find({ product: productId })
      .populate("user", "name")
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: reviews });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
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

    // VERIFIED PURCHASE: sudhu delivered order er customer e review dite parbe
    const order = await Order.findOne({
      user: session.user.id,
      orderStatus: "delivered",
      "items.product": product,
    });
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Product receive korar por review deoa jabe" },
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
    });

    // order reviewed flag
    order.reviewed = true;
    await order.save();

    // product er ratingAvg + numReviews recompute
    const stats = await Review.aggregate([
      { $match: { product: review.product } },
      { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    if (stats.length) {
      await Product.findByIdAndUpdate(product, {
        ratingAvg: Math.round(stats[0].avg * 10) / 10,
        numReviews: stats[0].count,
      });
    }

    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}