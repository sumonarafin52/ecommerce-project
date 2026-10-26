// app/api/products/[id]/related/route.js
//
// "You may also like", answered by the server.
//
// The product page used to build this itself by asking for everything in
// the same category — which showed an empty box whenever a category held
// one product, and never used what the shop knows about what sells with
// what. See lib/recommendations.js for the chain.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { productFilter } from "@/lib/productLookup";
import { relatedProducts, REASON_LABEL, REASON } from "@/lib/recommendations";
import { serverError } from "@/lib/apiError";

export async function GET(request, { params }) {
  try {
    await connectDB();

    // The URL segment is a slug or an id, exactly as the product route
    // takes it — one lookup rule for both, rather than a second copy here.
    const product = await Product.findOne(productFilter(params.id)).select("_id category subcategory brand status").lean();

    // No 404: an absent "you may also like" row is not an error page, and
    // a product whose status has changed should simply stop recommending.
    if (!product || product.status === "draft" || product.status === "private") {
      return NextResponse.json({ success: true, data: { products: [], label: "" } });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(12, Math.max(1, parseInt(searchParams.get("limit")) || 8));

    const all = await relatedProducts(product, { limit });

    // A specific claim only covers the products it is actually true of.
    //
    // The chain fills a row of eight by falling back through the
    // catalogue, so a row can easily be two products people really do buy
    // together followed by six that merely share a category. Labelling all
    // eight "Often bought together" is the kind of small lie that teaches
    // shoppers to ignore the row — so when the leading reason holds for
    // only part of the row, the row is trimmed to that part. Two true
    // recommendations beat eight padded ones; if there are fewer than two,
    // the full row shows under a heading that claims nothing.
    const leading = all[0]?.reason;
    const strong = all.filter((p) => p.reason === leading);
    const specific = leading && leading !== REASON.POPULAR && strong.length >= 2;

    const products = specific ? strong : all;
    const label = products.length ? (specific ? REASON_LABEL[leading] : "You may also like") : "";

    return NextResponse.json({ success: true, data: { products, label } });
  } catch (error) {
    return serverError(error, "api/products/related");
  }
}
