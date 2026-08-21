// app/api/addresses/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Address from "@/models/Address";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const addresses = await Address.find({ user: session.user.id }).sort({ isDefault: -1, createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: addresses });
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

    const body = await request.json();
    const { label, fullName, phone, address, city, country, state, postalCode, isDefault } = body;

    if (!fullName?.trim() || !phone?.trim() || !address?.trim() || !city?.trim()) {
      return NextResponse.json({ success: false, message: "Full name, phone, address and city are required" }, { status: 400 });
    }

    const existingCount = await Address.countDocuments({ user: session.user.id });
    // the very first address a customer saves becomes their default
    // automatically — there's nothing to choose between yet
    const shouldBeDefault = isDefault || existingCount === 0;

    if (shouldBeDefault) {
      await Address.updateMany({ user: session.user.id }, { $set: { isDefault: false } });
    }

    const created = await Address.create({
      user: session.user.id,
      label: label?.trim() || "Home",
      fullName: fullName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      country: country?.trim() || "",
      state: state?.trim() || "",
      postalCode: postalCode?.trim() || "",
      isDefault: shouldBeDefault,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
