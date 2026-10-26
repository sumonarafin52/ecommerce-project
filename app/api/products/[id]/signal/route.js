// app/api/products/[id]/signal/route.js
//
// "Somebody looked at this product" / "somebody put it in a basket".
//
// Public, because shoppers are mostly not signed in, and writing nothing
// but a counter. Deliberately minimal: it records that a product was seen,
// and nothing whatsoever about who saw it — no identifier is read, stored
// or derived, and the response carries no information back.
//
// Rate limited per address, because an open counter endpoint is otherwise
// an invitation. The limit is generous enough for real browsing (a person
// opening thirty products in ten minutes is just shopping) and low enough
// that the figures can't be moved far by hand. The admin page says plainly
// that these are best-effort counts.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { productFilter } from "@/lib/productLookup";
import { recordSignal, SIGNALS } from "@/lib/productStats";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export async function POST(request, { params }) {
  try {
    await connectDB();

    const body = (await request.json().catch(() => ({}))) || {};
    const type = body.type === SIGNALS.CART ? SIGNALS.CART : SIGNALS.VIEW;

    const limit = await rateLimit(`product-signal:${getClientIp(request)}`, { max: 120, windowMs: 10 * 60_000 });
    // Silently accepted rather than refused: a shopper browsing quickly has
    // done nothing wrong, and an error here would surface in their console
    // for no reason. The count simply stops.
    if (!limit.allowed) return NextResponse.json({ success: true });

    // The segment may be a slug or an id, exactly as elsewhere.
    const product = await Product.findOne(productFilter(params.id)).select("_id").lean();
    if (product) await recordSignal(product._id, type);

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error, "api/products/signal");
  }
}
