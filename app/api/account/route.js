// app/api/account/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const user = await User.findById(session.user.id).select("name email role createdAt").lean();
    if (!user) {
      return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const { name, email } = await request.json();
    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim().toLowerCase();

    if (!trimmedName) {
      return NextResponse.json({ success: false, message: "Name is required" }, { status: 400 });
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ success: false, message: "A valid email is required" }, { status: 400 });
    }

    const emailTaken = await User.findOne({ email: trimmedEmail, _id: { $ne: session.user.id } });
    if (emailTaken) {
      return NextResponse.json({ success: false, message: "That email is already in use" }, { status: 400 });
    }

    const updated = await User.findByIdAndUpdate(
      session.user.id,
      { name: trimmedName, email: trimmedEmail },
      { new: true }
    ).select("name email role");

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
