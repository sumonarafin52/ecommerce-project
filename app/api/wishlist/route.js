// app/api/wishlist/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Wishlist from "@/models/Wishlist";
import Product from "@/models/Product";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const items = await Wishlist.find({ user: session.user.id }).sort({ createdAt: -1 }).populate("product").lean();
    // a saved product may since have been deleted, or set to draft/private
    // — don't surface those as if they were still shoppable
    const visible = items.filter((w) => w.product && w.product.status === "public");

    return NextResponse.json({
      success: true,
      data: visible.map((w) => ({ _id: w._id, product: w.product, createdAt: w.createdAt })),
    });
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

    const { product } = await request.json();
    if (!product) {
      return NextResponse.json({ success: false, message: "Product id is required" }, { status: 400 });
    }

    const exists = await Product.exists({ _id: product });
    if (!exists) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    // idempotent — re-adding an already-saved product is a no-op, not an error
    await Wishlist.updateOne({ user: session.user.id, product }, { $setOnInsert: { user: session.user.id, product } }, { upsert: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
