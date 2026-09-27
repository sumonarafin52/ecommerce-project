// app/api/questions/route.js — staff list
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ProductQuestion from "@/models/ProductQuestion";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    const status = new URL(request.url).searchParams.get("status");
    const query = ["pending", "published", "hidden"].includes(status) ? { status } : {};
    const questions = await ProductQuestion.find(query)
      .populate("product", "name images")
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return NextResponse.json({ success: true, data: questions });
  } catch (error) {
    console.error("[questions:list]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
