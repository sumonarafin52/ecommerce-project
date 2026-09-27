// app/api/questions/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import ProductQuestion from "@/models/ProductQuestion";
import { hasPermission } from "@/lib/rbac";
import { notify } from "@/lib/notify";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// PUT { answer } → publish with answer   |   PUT { status: "hidden" } → hide
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return NextResponse.json({ success: false, message: "Invalid question" }, { status: 400 });
    }

    const { answer, status } = (await request.json()) || {};
    const q = await ProductQuestion.findById(params.id).populate("product", "name");
    if (!q) return NextResponse.json({ success: false, message: "Question not found" }, { status: 404 });

    if (answer !== undefined) {
      if (typeof answer !== "string" || answer.trim().length < 2 || answer.length > 2000) {
        return NextResponse.json({ success: false, message: "Answer must be 2–2000 characters" }, { status: 400 });
      }
      const firstAnswer = !q.answer;
      q.answer = answer.trim();
      q.answeredBy = session.user.name || "Staff";
      q.answeredAt = new Date();
      q.status = "published";

      if (firstAnswer) {
        notify({
          user: q.user,
          type: "question",
          title: "Your question was answered",
          message: `We answered your question about ${q.product?.name || "a product"}.`,
          link: q.product ? `/products/${q.product._id}` : "/",
        });
      }
    } else if (status !== undefined) {
      if (!["pending", "published", "hidden"].includes(status)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      // can't publish something with no answer to show
      if (status === "published" && !q.answer) {
        return NextResponse.json({ success: false, message: "Add an answer before publishing" }, { status: 400 });
      }
      q.status = status;
    }

    await q.save();
    return NextResponse.json({ success: true, data: q });
  } catch (error) {
    console.error("[questions:update]", error);
    return NextResponse.json({ success: false, message: "Couldn't update the question" }, { status: 500 });
  }
}
