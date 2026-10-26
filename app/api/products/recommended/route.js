// app/api/products/recommended/route.js
//
// "You might like this", for a shopper rather than for one product.
//
// The home page and the cart used to work this out in the browser, after
// downloading a hundred products to do it. This takes the handful of ids
// the shopper has recently looked at (or is holding in their basket) and
// sends back only the answer.
//
// POST because the seed ids are a list and a list belongs in a body, not
// in a URL — and because this must never be cached as if it were the same
// answer for everybody. Nothing is written, and nothing about the shopper
// is stored: the ids arrive, rank a query, and are forgotten.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { recommendedFor, REASON_LABEL, REASON } from "@/lib/recommendations";
import { serverError } from "@/lib/apiError";

export async function POST(request) {
  try {
    await connectDB();

    const body = (await request.json().catch(() => ({}))) || {};
    const limit = Math.min(12, Math.max(1, parseInt(body.limit) || 8));

    // recommendedFor validates the ids themselves — they come from the
    // browser and are treated as untrusted all the way to the query.
    const all = await recommendedFor(body.seedIds, { limit });

    // Same rule as the product page: a specific heading only stands when
    // the row is actually made of that, rather than being two real
    // co-purchases padded out with best sellers.
    const leading = all[0]?.reason;
    const strong = all.filter((p) => p.reason === leading);
    const specific = leading && leading !== REASON.POPULAR && strong.length >= 2;

    const products = specific ? strong : all;

    return NextResponse.json({
      success: true,
      data: { products, label: products.length ? (specific ? REASON_LABEL[leading] : "You might like") : "" },
    });
  } catch (error) {
    return serverError(error, "api/products/recommended");
  }
}
