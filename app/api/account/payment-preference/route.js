// app/api/account/payment-preference/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import PaymentPreference from "@/models/PaymentPreference";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const VALID_METHODS = ["cod", "sslcommerz"];
const VALID_WALLETS = ["", "bkash", "nagad", "rocket"];

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const pref = await PaymentPreference.findOne({ user: session.user.id }).lean();
    return NextResponse.json({
      success: true,
      data: pref || { defaultMethod: "cod", walletProvider: "", walletNumber: "" },
    });
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

    const { defaultMethod, walletProvider, walletNumber } = await request.json();

    if (defaultMethod && !VALID_METHODS.includes(defaultMethod)) {
      return NextResponse.json({ success: false, message: "Invalid payment method" }, { status: 400 });
    }
    if (walletProvider !== undefined && !VALID_WALLETS.includes(walletProvider)) {
      return NextResponse.json({ success: false, message: "Invalid wallet provider" }, { status: 400 });
    }
    // basic sanity check — not a real phone-number validator, just guards
    // against obviously wrong input for a field that's reference-only anyway
    if (walletNumber && !/^[0-9+\-\s]{6,20}$/.test(walletNumber)) {
      return NextResponse.json({ success: false, message: "That doesn't look like a valid number" }, { status: 400 });
    }

    const updated = await PaymentPreference.findOneAndUpdate(
      { user: session.user.id },
      {
        $set: {
          ...(defaultMethod !== undefined ? { defaultMethod } : {}),
          ...(walletProvider !== undefined ? { walletProvider } : {}),
          ...(walletNumber !== undefined ? { walletNumber: walletNumber.trim() } : {}),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
