// app/wishlist/page.js
// A real route for the wishlist, so the phone tab bar can link straight to
// it (a /profile?tab= link doesn't switch tabs when you're already on the
// profile page — only the query changes, and the page isn't re-mounted).
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import WishlistPanel from "@/components/profile/WishlistPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import Icon from "@/components/ui/Icon";

export default function WishlistPage() {
  const { status } = useSession();
  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-5 sm:py-8">
        {status === "loading" ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : status === "unauthenticated" ? (
          <div className="bg-cream-white border border-line rounded-xl text-center py-14 px-6">
            <Icon name="heart" size={40} strokeWidth={1.2} className="text-ink-muted mx-auto" />
            <h1 className="font-display text-xl font-semibold text-ink mt-3">Save things you love</h1>
            <p className="text-sm text-ink-muted mt-2">Sign in to see your wishlist on any device.</p>
            <Link
              href="/login?callbackUrl=%2Fwishlist"
              className="inline-block mt-6 bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg text-sm"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <WishlistPanel />
        )}
      </div>
    </div>
  );
}
