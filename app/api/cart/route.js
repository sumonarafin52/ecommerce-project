// app/api/cart/route.js
//
// Read-only cart recompute/preview endpoint — never mutates stock (that
// only happens in /api/orders at actual checkout). Used to let the client
// verify prices/stock against the database rather than trusting whatever
// it has cached locally. Kept consistent with the same validation rules
// (quantity, product visibility, variant handling) as the order endpoint.
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { getEffectivePrice, isValidQuantity } from "@/lib/utils";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-fA-F]{24}$/.test(s));

    // only ever surface products a normal shopper could actually see —
    // draft/private/unlisted items shouldn't leak price/stock here either
    const products = await Product.find({ _id: { $in: ids }, status: "public" });
    const items = products.map((p) => ({
      product: p._id,
      name: p.name,
      slug: p.slug,
      price: getEffectivePrice(p),
      stock: p.stock,
      image: p.images?.[0] || "",
    }));

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[cart:get]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Cart is empty" }, { status: 400 });
    }

    for (const item of items) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ success: false, message: "Invalid item format" }, { status: 400 });
      }
      if (typeof item.product !== "string" || !/^[0-9a-fA-F]{24}$/.test(item.product)) {
        return NextResponse.json({ success: false, message: "Invalid product reference" }, { status: 400 });
      }
      if (!isValidQuantity(item.quantity)) {
        return NextResponse.json(
          { success: false, message: "Invalid quantity — must be a whole number between 1 and 500" },
          { status: 400 }
        );
      }
      if (item.combinationKey !== undefined && typeof item.combinationKey !== "string") {
        return NextResponse.json({ success: false, message: "Invalid variant selection" }, { status: 400 });
      }
    }

    // refresh prices/stock from DB so totals can't be tampered client-side
    let totalAmount = 0;
    const refreshed = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      // a product that's been deleted, or set to draft/private since it
      // was added to the cart, should behave as if it isn't purchasable
      if (!product || product.status !== "public") {
        return NextResponse.json({ success: false, message: "One of the items in your cart is no longer available" }, { status: 404 });
      }

      let combo = null;
      if (item.combinationKey) {
        combo = (product.combinations || []).find((c) => c.key === item.combinationKey && c.active);
        if (!combo) {
          return NextResponse.json(
            { success: false, message: `The selected option for ${product.name} is no longer available` },
            { status: 400 }
          );
        }
      }

      const stockAvailable = combo ? combo.stock : product.stock;
      if (stockAvailable < item.quantity) {
        return NextResponse.json(
          { success: false, message: `Not enough stock for ${product.name}${combo ? ` (${combo.key})` : ""}` },
          { status: 409 }
        );
      }

      const price = combo?.price > 0 ? combo.price : getEffectivePrice(product);
      totalAmount += price * item.quantity;
      refreshed.push({
        product: product._id,
        name: combo ? `${product.name} (${combo.key})` : product.name,
        slug: product.slug,
        quantity: item.quantity,
        price,
        combinationKey: item.combinationKey || "",
        stock: stockAvailable,
        image: product.images?.[0] || "",
      });
    }

    return NextResponse.json({ success: true, data: { items: refreshed, totalAmount } });
  } catch (error) {
    console.error("[cart:post]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
