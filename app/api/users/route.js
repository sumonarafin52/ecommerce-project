// app/api/users/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { hasPermission } from "@/lib/rbac";
import { validateName, validateEmail, validatePassword } from "@/lib/authValidation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

export async function POST(request) {
  try {
    await connectDB();

    const ip = getClientIp(request);
    const limit = await rateLimit(`register:${ip}`, { max: 10, windowMs: 60 * 60_000 }); // 10/hour per IP
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, email, password } = body || {};

    const nameError = validateName(name);
    if (nameError) return NextResponse.json({ success: false, message: nameError }, { status: 400 });

    const emailError = validateEmail(email);
    if (emailError) return NextResponse.json({ success: false, message: emailError }, { status: 400 });

    const passwordError = validatePassword(password, { name, email });
    if (passwordError) return NextResponse.json({ success: false, message: passwordError }, { status: 400 });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      // Deliberately vague: saying "email already registered" lets anyone
      // probe which addresses have accounts here. The rate limit above
      // makes bulk probing slow, but there's no reason to confirm it
      // outright either. A real duplicate signup gets told to sign in.
      return NextResponse.json(
        {
          success: false,
          message: "We couldn't create that account. If you already have one, try signing in or resetting your password.",
        },
        { status: 409 }
      );
    }

    // cost 12 rather than 10 — roughly 4x the work per guess for an
    // attacker with a stolen database, still imperceptible on a login
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hashed });

    return NextResponse.json(
      { success: true, data: { id: user._id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (error) {
    // never hand raw driver/validation internals to the client
    console.error("[users:register]", error);
    return NextResponse.json({ success: false, message: "Couldn't create your account. Please try again." }, { status: 500 });
  }
}

// Staff with "customers" permission (e.g. Support role): customer list
// (also used by the admin "create order" modal's customer picker)
export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "customers"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const users = await User.find()
      .select("name email role createdAt")
      .sort({ createdAt: -1 })
      .limit(200);

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return serverError(error, "api/users");
  }
}