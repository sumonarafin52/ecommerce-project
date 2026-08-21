// app/api/addresses/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Address from "@/models/Address";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const existing = await Address.findById(params.id);
    if (!existing || existing.user.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Address not found" }, { status: 404 });
    }

    const body = await request.json();
    const { label, fullName, phone, address, city, country, state, postalCode, isDefault } = body;

    if (fullName !== undefined) existing.fullName = fullName.trim();
    if (phone !== undefined) existing.phone = phone.trim();
    if (address !== undefined) existing.address = address.trim();
    if (city !== undefined) existing.city = city.trim();
    if (label !== undefined) existing.label = label.trim() || "Home";
    if (country !== undefined) existing.country = country.trim();
    if (state !== undefined) existing.state = state.trim();
    if (postalCode !== undefined) existing.postalCode = postalCode.trim();

    if (isDefault === true && !existing.isDefault) {
      await Address.updateMany({ user: session.user.id, _id: { $ne: existing._id } }, { $set: { isDefault: false } });
      existing.isDefault = true;
    }

    await existing.save();
    return NextResponse.json({ success: true, data: existing });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const existing = await Address.findById(params.id);
    if (!existing || existing.user.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Address not found" }, { status: 404 });
    }

    const wasDefault = existing.isDefault;
    await existing.deleteOne();

    // promote the most recently added remaining address to default so the
    // customer isn't left with none — checkout always has a sensible pick
    if (wasDefault) {
      const next = await Address.findOne({ user: session.user.id }).sort({ createdAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
