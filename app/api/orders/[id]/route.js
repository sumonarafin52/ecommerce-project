// app/api/orders/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id).populate("user", "name email");
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (order.user._id.toString() !== session.user.id && session.user.role !== "admin") {
      return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
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

    const body = await request.json();
    const isAdmin = session.user.role === "admin";
    const isOwner = order.user.toString() === session.user.id;

    // ===== CUSTOMER: confirm receipt (fulfill) =====
    if (body.confirmReceipt) {
      if (!isOwner) {
        return NextResponse.json({ success: false, message: "Not your order" }, { status: 403 });
      }
      if (order.orderStatus !== "shipped") {
        return NextResponse.json(
          { success: false, message: "Order is not shipped yet" },
          { status: 400 }
        );
      }
      order.orderStatus = "delivered";
      order.deliveredAt = new Date();
      await order.save();
      return NextResponse.json({ success: true, data: order });
    }

    // ===== ADMIN: status updates =====
    if (!isAdmin) {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 401 });
    }

    const { orderStatus, paymentStatus } = body;

    if (orderStatus && orderStatus !== order.orderStatus) {
      if (orderStatus === "shipped" && !order.shippedAt) order.shippedAt = new Date();
      if (orderStatus === "delivered" && !order.deliveredAt) order.deliveredAt = new Date();
      // cancel korle stock fire dei
      if (orderStatus === "cancelled") {
        for (const it of order.items) {
          await Product.findByIdAndUpdate(it.product, { $inc: { stock: it.quantity } });
        }
      }
      order.orderStatus = orderStatus;
    }

    if (paymentStatus && paymentStatus !== order.paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();
    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ===== ADMIN: delete order (bulk delete supported from client) =====
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 401 });
    }

    const order = await Order.findById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // stock fire dei sudhu jodi order ekhono processing thake (ship hoy nai)
    // cancelled order er stock age thekei return kora, delivered mane product chole geche
    if (order.orderStatus === "processing") {
      for (const it of order.items) {
        await Product.findByIdAndUpdate(it.product, { $inc: { stock: it.quantity } });
      }
    }

    await Order.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true, message: "Order deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}