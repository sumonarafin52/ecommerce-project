// app/api/products/[id]/canonical/route.js
//
// Where does this product id live now? Answers with the slug, and nothing
// else.
//
// middleware.js calls this to turn a legacy /products/<id> URL into a real
// 308 to /products/<slug>. It exists rather than middleware reusing
// /api/products/[id] because that endpoint returns the whole product —
// description, images, variants, stock — and a redirect needs one short
// string. On a popular catalogue that difference is the entire cost of the
// redirect.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { isObjectId } from "@/lib/slug";
import { serverError } from "@/lib/apiError";

export async function GET(request, { params }) {
  try {
    // Only ids: a slug URL is already canonical and has no reason to be here.
    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    await connectDB();
    // Public and unlisted have a page a visitor can open, so a redirect is
    // right for both. Draft and private reveal nothing — not even that the
    // id exists, which a slug in the response would do.
    const product = await Product.findOne({ _id: params.id, status: { $in: ["public", "unlisted"] } })
      .select("slug")
      .lean();

    if (!product?.slug) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, slug: product.slug },
      // A product's slug changes almost never, and this sits in front of
      // every legacy link, so it is worth not asking the database twice.
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } }
    );
  } catch (error) {
    return serverError(error, "api/products/canonical");
  }
}
