// app/api/products/suggest/route.js
// Lightweight autocomplete for the storefront search bar. Deliberately
// separate from /api/products (which does full filtering/pagination/
// relevance ranking) — this just needs to be fast and return a handful of
// candidates as the person types, so it does a narrower prefix-first query
// instead of the full search pipeline.
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { escapeRegExp } from "@/lib/productSearch";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: { products: [], categories: [], brands: [] } });
    }

    const startsWith = new RegExp(`^${escapeRegExp(q)}`, "i");
    const contains = new RegExp(escapeRegExp(q), "i");

    const [products, categories, brands] = await Promise.all([
      // prefix matches first, then fall back to contains-matches to fill
      // out the list, capped at 6 total
      Product.find({ status: "public", name: startsWith }).select("name images price discountPrice slug").limit(6).lean(),
      Product.distinct("category", { status: "public", category: contains }),
      Product.distinct("brand", { status: "public", brand: contains }),
    ]);

    let productSuggestions = products;
    if (productSuggestions.length < 6) {
      const extra = await Product.find({
        status: "public",
        name: contains,
        _id: { $nin: productSuggestions.map((p) => p._id) },
      })
        .select("name images price discountPrice slug")
        .limit(6 - productSuggestions.length)
        .lean();
      productSuggestions = [...productSuggestions, ...extra];
    }

    return NextResponse.json({
      success: true,
      data: {
        products: productSuggestions,
        categories: categories.slice(0, 4),
        brands: brands.slice(0, 4),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
