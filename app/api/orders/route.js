// app/api/orders/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { getEffectivePrice } from "@/lib/utils";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    // AUTO-FULFILL: ship howar 30 din por o keu confirm na korle auto delivered
    await Order.updateMany(
      { orderStatus: "shipped", shippedAt: { $lte: new Date(Date.now() - THIRTY_DAYS) } },
      { $set: { orderStatus: "delivered", deliveredAt: new Date() } }
    );

    const query = session.user.role === "admin" ? {} : { user: session.user.id };
    const orders = await Order.find(query)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const isAdmin = session.user.role === "admin";
    const { items, shippingAddress, paymentMethod, userId, paymentStatus } = await request.json();

    // ADMIN: customer er jonno order create (phone/manual order)
    let targetUserId = session.user.id;
    if (isAdmin && userId) {
      const customer = await User.findById(userId);
      if (!customer) {
        return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
      }
      targetUserId = customer._id.toString();
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Cart cannot be empty" }, { status: 400 });
    }

    const address = {
      fullName: shippingAddress?.fullName?.trim(),
      phone: shippingAddress?.phone?.trim(),
      address: shippingAddress?.address?.trim(),
      city: shippingAddress?.city?.trim(),
    };
    if (!address.fullName || !address.phone || !address.address || !address.city) {
      return NextResponse.json({ success: false, message: "Complete shipping address is required" }, { status: 400 });
    }

    const finalPaymentMethod = paymentMethod === "cod" ? "cod" : "sslcommerz";

    // DRAFT ORDER: sudhu customer checkout e reuse hobe (admin create always new)
    const existing = isAdmin
      ? null
      : await Order.findOne({
          user: targetUserId,
          paymentStatus: "pending",
          paymentMethod: "sslcommerz",
        });

    const oldMap = new Map();
    if (existing) {
      for (const it of existing.items) {
        const key = String(it.product);
        oldMap.set(key, (oldMap.get(key) || 0) + it.quantity);
      }
    }

    // DB theke price + stock check
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      if (!item.product || !item.quantity) {
        return NextResponse.json({ success: false, message: "Invalid item format" }, { status: 400 });
      }
      const product = await Product.findById(item.product);
      if (!product) {
        return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
      }
      const oldQ = oldMap.get(String(product._id)) || 0;
      const available = product.stock + oldQ;
      if (available < item.quantity) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock for ${product.name}. Available: ${available}` },
          { status: 400 }
        );
      }
      const price = getEffectivePrice(product);
      totalAmount += price * item.quantity;
      orderItems.push({ product: product._id, name: product.name, quantity: item.quantity, price });
    }

    // stock adjustment (delta)
    const newMap = new Map();
    for (const it of orderItems) {
      const key = String(it.product);
      newMap.set(key, (newMap.get(key) || 0) + it.quantity);
    }
    const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const id of allIds) {
      const delta = (oldMap.get(id) || 0) - (newMap.get(id) || 0);
      if (delta !== 0) {
        await Product.findByIdAndUpdate(id, { $inc: { stock: delta } });
      }
    }

    // draft thakle UPDATE
    if (existing) {
      existing.items = orderItems;
      existing.totalAmount = totalAmount;
      existing.shippingAddress = address;
      existing.paymentMethod = finalPaymentMethod;
      await existing.save();
      return NextResponse.json({ success: true, data: existing });
    }

    // notun order CREATE (customer ba admin)
    const order = await Order.create({
      orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
      user: targetUserId,
      items: orderItems,
      shippingAddress: address,
      paymentMethod: finalPaymentMethod,
      totalAmount,
      paymentStatus: isAdmin && paymentStatus ? paymentStatus : "pending",
      orderStatus: "processing",
    });

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return NextResponse.json({ success: false, message: "Validation failed", errors: messages }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}