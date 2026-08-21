// app/api/notifications/read-all/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Notification from "@/models/Notification";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function PUT() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    await Notification.updateMany({ user: session.user.id, read: false }, { $set: { read: true } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
