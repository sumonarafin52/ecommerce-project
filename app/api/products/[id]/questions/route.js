// app/api/products/[id]/questions/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import User from "@/models/User";
import ProductQuestion from "@/models/ProductQuestion";
import { rateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// GET — published Q&A, plus the signed-in customer's own pending questions
export async function GET(request, { params }) {
  try {
    if (!OBJECT_ID.test(params.id)) return NextResponse.json({ success: true, data: { published: [], mine: [] } });
    await connectDB();
    const session = await getServerSession(authOptions);

    const published = await ProductQuestion.find({ product: params.id, status: "published" })
      .select("askerName question answer answeredAt createdAt")
      .sort({ answeredAt: -1 })
      .limit(50)
      .lean();

    const mine = session?.user
      ? await ProductQuestion.find({ product: params.id, user: session.user.id, status: "pending" })
          .select("question createdAt")
          .sort({ createdAt: -1 })
          .lean()
      : [];

    return NextResponse.json({ success: true, data: { published, mine } });
  } catch (error) {
    console.error("[questions:get]", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}

// POST { question }
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Please sign in to ask a question" }, { status: 401 });
    }
    if (!OBJECT_ID.test(params.id)) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const { question } = (await request.json()) || {};
    if (typeof question !== "string" || question.trim().length < 10 || question.length > 500) {
      return NextResponse.json({ success: false, message: "Your question should be 10–500 characters" }, { status: 400 });
    }

    const limit = await rateLimit(`question:${session.user.id}`, { max: 5, windowMs: 60 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "You've asked several questions recently — please wait a bit." }, { status: 429 });
    }

    await connectDB();
    const product = await Product.findById(params.id).select("name status").lean();
    if (!product || product.status !== "public") {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const created = await ProductQuestion.create({
      product: params.id,
      user: session.user.id,
      // first name only in public — never the full name or email
      askerName: String(session.user.name || "Customer").trim().split(/\s+/)[0].slice(0, 30),
      question: question.trim(),
    });

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const a of admins) {
      notify({
        user: a._id,
        type: "question",
        title: "New product question",
        message: `On ${product.name}: "${question.trim().slice(0, 120)}"`,
        link: "/admin/questions",
      });
    }

    return NextResponse.json(
      { success: true, message: "Thanks! We'll answer soon — you'll be notified.", data: { _id: created._id } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[questions:create]", error);
    return NextResponse.json({ success: false, message: "Couldn't submit your question" }, { status: 500 });
  }
}
