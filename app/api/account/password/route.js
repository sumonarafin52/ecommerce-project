// app/api/account/password/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { rateLimit } from "@/lib/rateLimit";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    // limits attempts against this account specifically — protects against
    // someone with a hijacked/stolen session trying to brute-force the
    // current password to lock the real owner out
    const limit = rateLimit(`change-password:${session.user.id}`, { max: 8, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, message: "Current and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, message: "New password must be at least 6 characters" }, { status: 400 });
    }

    const user = await User.findById(session.user.id).select("+password");
    if (!user) {
      return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ success: false, message: "Current password is incorrect" }, { status: 400 });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
