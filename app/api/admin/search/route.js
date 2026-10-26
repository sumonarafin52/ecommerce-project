// app/api/admin/search/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import { hasPermission } from "@/lib/rbac";
import { serverError } from "@/lib/apiError";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// A query goes straight into a regex, so metacharacters must be escaped:
// "(" would throw, and ".*" would match every document.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(request) {
  try {
    const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 60);
    if (q.length < 2) return NextResponse.json({ success: true, data: { products: [], orders: [], customers: [] } });

    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

    const [canProducts, canOrders, canCustomers] = await Promise.all([
      hasPermission(session, "products"),
      hasPermission(session, "orders"),
      hasPermission(session, "customers"),
    ]);

    const rx = new RegExp(escapeRegex(q), "i");

    const [products, orders, customers] = await Promise.all([
      canProducts
        ? Product.find({ $or: [{ name: rx }, { sku: rx }, { brand: rx }] })
            .select("name sku price images stock status")
            .limit(5)
            .lean()
        : [],
      canOrders
        ? Order.find({
            $or: [{ orderNumber: rx }, { "shippingAddress.fullName": rx }, { "shippingAddress.phone": rx }],
          })
            .select("orderNumber totalAmount orderStatus paymentStatus createdAt shippingAddress.fullName")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean()
        : [],
      canCustomers
        ? User.find({ role: "customer", $or: [{ name: rx }, { email: rx }] })
            .select("name email createdAt")
            .limit(5)
            .lean()
        : [],
    ]);

    return NextResponse.json({ success: true, data: { products, orders, customers } });
  } catch (error) {
    return serverError(error, "api/admin/search");
  }
}
