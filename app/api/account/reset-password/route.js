// app/api/account/reset-password/route.js
export const dynamic = "force-dynamic";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { validatePassword } from "@/lib/authValidation";

const INVALID = { success: false, message: "This reset link is invalid or has expired. Please request a new one." };

export async function POST(request) {
  try {
    const { token, password } = (await request.json()) || {};

    // Tokens are 64 hex chars; reject anything else before touching the DB.
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json(INVALID, { status: 400 });
    }

    // Guessing a 256-bit token is hopeless, but capping attempts per IP
    // keeps this endpoint from being hammered regardless.
    const ip = getClientIp(request);
    const limit = await rateLimit(`reset-ip:${ip}`, { max: 10, windowMs: 15 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    await connectDB();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Look up first so the new password can be checked against the user's
    // own name/email (the same rules as signup) before anything is written.
    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpires: { $gt: new Date() },
    }).select("name email");
    if (!user) {
      return NextResponse.json(INVALID, { status: 400 });
    }

    const passwordError = validatePassword(password, { name: user.name, email: user.email });
    if (passwordError) {
      return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Consume the token in the SAME atomic write that sets the password,
    // conditioned on the token still being present and unexpired. If two
    // requests race with the same link, only one matches; the other gets
    // "invalid" — a reset link can never be used twice.
    const result = await User.updateOne(
      { _id: user._id, resetTokenHash: tokenHash, resetTokenExpires: { $gt: new Date() } },
      { $set: { password: hashed, resetTokenHash: null, resetTokenExpires: null } }
    );

    if (result.modifiedCount !== 1) {
      return NextResponse.json(INVALID, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    console.error("[reset-password]", error);
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
