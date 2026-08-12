// app/api/users/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// ADMIN: single customer details
export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 401 });
    }

    const user = await User.findById(params.id).select("name email role createdAt");
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ADMIN: edit customer (name, email, role)
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 401 });
    }

    const { name, email, role } = await request.json();

    // email duplicate check (onno karor sathe)
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: params.id } });
      if (existing) {
        return NextResponse.json({ success: false, message: "Email already in use" }, { status: 400 });
      }
    }

    const update = {};
    if (name) update.name = name;
    if (email) update.email = email;
    if (role && ["customer", "admin"].includes(role)) update.role = role;

    const user = await User.findByIdAndUpdate(params.id, update, { new: true }).select("name email role createdAt");
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ADMIN: delete customer
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 401 });
    }

    // nijeke delete kora jabe na
    if (session.user.id === params.id) {
      return NextResponse.json({ success: false, message: "You cannot delete your own account" }, { status: 400 });
    }

    const user = await User.findByIdAndDelete(params.id);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "User deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}