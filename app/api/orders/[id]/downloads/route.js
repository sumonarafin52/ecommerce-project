// app/api/orders/[id]/downloads/route.js
//
// Delivers download links for any digital products in a paid order. This
// closes a gap where the product page told customers "you'll get a
// download link after payment" but nothing anywhere actually served one —
// DigitalProduct existed in the admin panel and could be linked to a
// Product, but no customer-facing route ever exposed fileUrl.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import DigitalProduct from "@/models/DigitalProduct";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (order.user.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Not your order" }, { status: 403 });
    }
    // Digital goods deliver on payment, not on physical fulfillment —
    // orderStatus (shipped/delivered) doesn't apply to them the same way.
    if (order.paymentStatus !== "paid") {
      return NextResponse.json({ success: true, data: [] });
    }

    const productIds = order.items.map((it) => it.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select("digitalProduct")
      .populate("digitalProduct")
      .lean();

    const downloadable = [];
    for (const it of order.items) {
      const product = products.find((p) => String(p._id) === String(it.product));
      const dp = product?.digitalProduct;
      if (dp && dp.active) {
        downloadable.push({
          productId: String(it.product),
          name: it.name,
          fileName: dp.fileName || dp.title,
          fileUrl: dp.fileUrl,
          fileSize: dp.fileSize,
          fileType: dp.fileType,
        });
      }
    }

    if (downloadable.length) {
      // note: this only lists what's available — the actual download click
      // (POST below) is what increments each DigitalProduct's counter, so
      // a background page-load check here doesn't inflate download stats.
    }

    return NextResponse.json({ success: true, data: downloadable });
  } catch (error) {
    console.error("[orders:downloads]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// Called right before the customer opens/downloads a specific file — this
// is what actually increments DigitalProduct.downloads, kept separate from
// the GET above so listing available downloads (e.g. a background check on
// page load) doesn't itself count as a download.
export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id);
    if (!order || order.user.toString() !== session.user.id || order.paymentStatus !== "paid") {
      return NextResponse.json({ success: false, message: "Not available" }, { status: 403 });
    }

    const { productId } = await request.json();
    const item = order.items.find((it) => String(it.product) === String(productId));
    if (!item) {
      return NextResponse.json({ success: false, message: "Item not found in this order" }, { status: 404 });
    }

    const product = await Product.findById(productId).select("digitalProduct").populate("digitalProduct");
    if (!product?.digitalProduct?.active) {
      return NextResponse.json({ success: false, message: "Not a digital item" }, { status: 400 });
    }

    await DigitalProduct.updateOne({ _id: product.digitalProduct._id }, { $inc: { downloads: 1 } });
    return NextResponse.json({ success: true, data: { fileUrl: product.digitalProduct.fileUrl } });
  } catch (error) {
    console.error("[orders:downloads:record]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
