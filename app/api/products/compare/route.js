// app/api/products/compare/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";

export async function GET(request) {
  try {
    const ids = (new URL(request.url).searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-fA-F]{24}$/.test(s))
      .slice(0, 4);
    if (!ids.length) return NextResponse.json({ success: true, data: [] });

    await connectDB();
    // public only — an id saved while a product was live may since have been
    // set to draft/private, and must not leak through this endpoint
    const products = await Product.find({ _id: { $in: ids }, status: "public" })
      .select("name slug images price discountPrice brand category subcategory stock ratingAvg numReviews weight options combinations shortDescription")
      .lean();

    // keep the order the customer added them in
    const order = new Map(ids.map((id, i) => [id, i]));
    products.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error("[products:compare]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
