// app/api/cart/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { getEffectivePrice } from "@/lib/utils";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);

    const products = await Product.find({ _id: { $in: ids } });
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const { items } = await request.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, message: "Cart is empty" }, { status: 400 });
    }

    // refresh prices/stock from DB so totals can't be tampered client-side
    let totalAmount = 0;
    const refreshed = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) continue;
      if (product.stock < item.quantity) {
        return NextResponse.json(
          { success: false, message: `Not enough stock for ${product.name}` },
          { status: 400 }
        );
      }
      const price = getEffectivePrice(product);
      totalAmount += price * item.quantity;
      refreshed.push({
        product: product._id,
        name: product.name,
        slug: product.slug,
        quantity: item.quantity,
        price,
        stock: product.stock,
        image: product.images?.[0] || "",
      });
    }

    return NextResponse.json({ success: true, data: { items: refreshed, totalAmount } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}