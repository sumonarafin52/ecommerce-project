// app/api/reviews/[id]/helpful/route.js
//
// "Was this review helpful?" — a toggle, stored as the set of people who
// voted rather than a bare counter.
//
// Keeping the voter ids means one account can't inflate a review by clicking
// repeatedly, a vote can be withdrawn, and the button can show the viewer
// their own state. The ids never leave the server (see the reviews GET).
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Review from "@/models/Review";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isObjectId } from "@/lib/digitalDelivery";
import { serverError } from "@/lib/apiError";

export async function POST(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Sign in to mark a review as helpful" },
        { status: 401 }
      );
    }
    if (!isObjectId(params.id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const review = await Review.findById(params.id).select("user helpfulVotes status");
    if (!review || review.status === "hidden") {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    // Voting for your own review would be meaningless and is the first thing
    // anyone would try.
    if (String(review.user) === String(session.user.id)) {
      return NextResponse.json(
        { success: false, message: "You can't vote on your own review" },
        { status: 400 }
      );
    }

    const alreadyVoted = (review.helpfulVotes || []).some((id) => String(id) === String(session.user.id));

    // $addToSet / $pull rather than reading and rewriting the array, so two
    // simultaneous clicks can't lose a vote or double-count one.
    const updated = await Review.findByIdAndUpdate(
      params.id,
      alreadyVoted
        ? { $pull: { helpfulVotes: session.user.id } }
        : { $addToSet: { helpfulVotes: session.user.id } },
      { new: true, select: "helpfulVotes" }
    );

    return NextResponse.json({
      success: true,
      data: {
        helpfulCount: updated.helpfulVotes.length,
        viewerFoundHelpful: !alreadyVoted,
      },
    });
  } catch (error) {
    return serverError(error, "api/reviews/helpful");
  }
}
