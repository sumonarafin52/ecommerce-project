// app/api/cart/saved/route.js
//
// The signed-in customer's basket, as the server holds it.
//
// GET merges nothing and decides nothing — it hands back what is stored,
// already re-checked against the catalogue, so the browser can merge it
// with whatever is in localStorage and push the result back with PUT.
//
// Everything here is scoped to session.user.id and never takes a user id
// from the request: a cart is tied to its owner by the session alone, so
// there is no id to tamper with and no other customer's basket to reach.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Cart from "@/models/Cart";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidateCart } from "@/lib/cartRevalidation";
import { toStoredItems } from "@/lib/savedCart";
import { serverError } from "@/lib/apiError";

const requireUser = async () => {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
};

const unauthorised = () => NextResponse.json({ success: false, message: "Login required" }, { status: 401 });

export async function GET() {
  try {
    await connectDB();
    const user = await requireUser();
    if (!user) return unauthorised();

    const cart = await Cart.findOne({ user }).lean();
    const stored = cart?.items || [];

    // Checked against the catalogue before it goes anywhere near a page:
    // a basket saved three weeks ago may hold a product that has since sold
    // out, changed price or been unpublished.
    const checked = await revalidateCart(stored.map((i) => ({ ...i, product: String(i.product) })));

    return NextResponse.json({
      success: true,
      data: {
        items: stored.map((i) => ({ product: String(i.product), combinationKey: i.combinationKey || "", quantity: i.quantity })),
        lines: checked.items,
        changed: checked.changed,
        updatedAt: cart?.lastActivityAt || null,
      },
    });
  } catch (error) {
    return serverError(error, "api/cart/saved");
  }
}

/**
 * Replaces the saved basket with what the browser now holds.
 *
 * A replace rather than a patch, because the browser is the one place that
 * knows the whole basket after a merge — and because a half-applied patch
 * is a basket nobody can explain.
 */
export async function PUT(request) {
  try {
    await connectDB();
    const user = await requireUser();
    if (!user) return unauthorised();

    const body = (await request.json().catch(() => ({}))) || {};
    const items = toStoredItems(body.items);

    const existing = await Cart.findOne({ user }).select("items reminderCount").lean();

    // Filling an empty basket starts a new episode, so the reminder history
    // is cleared with it. Without this, one reminder months ago would mean
    // this customer could never be reminded again — the quota is meant to
    // stop a shop nagging about ONE basket, not to retire the customer.
    const startingFresh = items.length > 0 && !(existing?.items?.length > 0);

    // Saving marks the basket as touched, which is also what takes it out
    // of the abandoned list: somebody who is still shopping is not somebody
    // to email about shopping.
    await Cart.findOneAndUpdate(
      { user },
      {
        $set: {
          items,
          lastActivityAt: new Date(),
          ...(startingFresh ? { reminderSentAt: null, reminderCount: 0, recoveredAt: null, recoveredOrder: null } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: { saved: items.length } });
  } catch (error) {
    return serverError(error, "api/cart/saved");
  }
}

/** Empties the saved basket — used when the customer clears their cart. */
export async function DELETE() {
  try {
    await connectDB();
    const user = await requireUser();
    if (!user) return unauthorised();

    await Cart.findOneAndUpdate({ user }, { $set: { items: [], lastActivityAt: new Date() } }, { upsert: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error, "api/cart/saved");
  }
}
