// app/api/cart/route.js
//
// Checks a cart against the database and reports what changed.
//
// It never mutates anything — stock is only reserved in /api/orders at
// actual checkout. Its job is to make sure the shopper is looking at real
// prices and real availability before they commit, rather than whatever
// their browser cached days ago.
//
// It reports per line rather than failing the whole cart: a shopper with one
// sold-out item out of five should keep the other four, and be told which
// one went.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { revalidateCart } from "@/lib/cartRevalidation";
import { serverError } from "@/lib/apiError";

/**
 * POST because a cart is a list, and a list of a hundred items does not
 * belong in a query string. Nothing is written.
 */
export async function POST(request) {
  try {
    await connectDB();
    const body = (await request.json().catch(() => ({}))) || {};
    const result = await revalidateCart(body.items);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return serverError(error, "api/cart");
  }
}
