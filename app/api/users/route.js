// app/api/users/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(request) {
  try {
    await connectDB();

    const ip = getClientIp(request);
    const limit = rateLimit(`register:${ip}`, { max: 10, windowMs: 60 * 60_000 }); // 10/hour per IP
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, message: "All fields are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ success: false, message: "Email already registered" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: normalizedEmail, password: hashed });

    return NextResponse.json(
      { success: true, data: { id: user._id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ADMIN: customer list (create order modal er jonno)
export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 401 });
    }

    const users = await User.find()
      .select("name email role createdAt")
      .sort({ createdAt: -1 })
      .limit(200);

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}