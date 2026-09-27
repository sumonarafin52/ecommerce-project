// app/api/stock-alerts/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import StockAlert from "@/models/StockAlert";
import { rateLimit } from "@/lib/rateLimit";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function parse(product, combinationKey) {
  if (typeof product !== "string" || !OBJECT_ID.test(product)) return "Invalid product";
  if (combinationKey !== undefined && combinationKey !== "" && typeof combinationKey !== "string") return "Invalid option";
  return null;
}

// GET ?product=id&combinationKey=... → is the signed-in customer subscribed?
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: true, data: { subscribed: false } });

    const { searchParams } = new URL(request.url);
    const product = searchParams.get("product");
    const combinationKey = searchParams.get("combinationKey") || "";
    if (parse(product, combinationKey)) return NextResponse.json({ success: true, data: { subscribed: false } });

    await connectDB();
    const alert = await StockAlert.findOne({ user: session.user.id, product, combinationKey, notifiedAt: null }).lean();
    return NextResponse.json({ success: true, data: { subscribed: !!alert } });
  } catch (error) {
    console.error("[stock-alerts:get]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// POST { product, combinationKey } → subscribe
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Please sign in to get notified" }, { status: 401 });
    }

    const limit = await rateLimit(`stock-alert:${session.user.id}`, { max: 30, windowMs: 60 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many requests — please try again later." }, { status: 429 });
    }

    const { product, combinationKey = "" } = (await request.json()) || {};
    const bad = parse(product, combinationKey);
    if (bad) return NextResponse.json({ success: false, message: bad }, { status: 400 });

    await connectDB();
    const doc = await Product.findById(product).select("status stock combinations").lean();
    if (!doc || doc.status !== "public") {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    let stock = doc.stock || 0;
    if (combinationKey) {
      const combo = (doc.combinations || []).find((c) => c.key === combinationKey && c.active !== false);
      if (!combo) return NextResponse.json({ success: false, message: "That option doesn't exist" }, { status: 400 });
      stock = combo.stock || 0;
    }
    // Only meaningful while it's actually unavailable — otherwise they can
    // just buy it now.
    if (stock > 0) {
      return NextResponse.json({ success: false, message: "This item is in stock — you can order it now." }, { status: 409 });
    }

    // Re-subscribing after a previous alert already fired resets it, so the
    // customer is told again on the next restock.
    await StockAlert.updateOne(
      { user: session.user.id, product, combinationKey },
      { $set: { notifiedAt: null } },
      { upsert: true }
    );

    return NextResponse.json({ success: true, message: "We'll let you know as soon as it's back." });
  } catch (error) {
    console.error("[stock-alerts:post]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// DELETE ?product=id&combinationKey=... → unsubscribe
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const product = searchParams.get("product");
    const combinationKey = searchParams.get("combinationKey") || "";
    const bad = parse(product, combinationKey);
    if (bad) return NextResponse.json({ success: false, message: bad }, { status: 400 });

    await connectDB();
    await StockAlert.deleteOne({ user: session.user.id, product, combinationKey });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stock-alerts:delete]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
