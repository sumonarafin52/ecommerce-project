// components/layout/Header.jsx
"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import useCartStore from "@/store/cartStore";

export default function Header() {
  const { data: session } = useSession();
  const items = useCartStore((state) => state.items);
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="bg-primary text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Sumon<span className="text-accent">Shop</span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6 text-sm sm:text-base">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <Link href="/products" className="hover:text-accent">
            Products
          </Link>
          <Link href="/cart" className="relative hover:text-accent">
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-accent text-primary text-xs font-bold rounded-full px-1.5">
                {cartCount}
              </span>
            )}
          </Link>

          {session ? (
            <>
              {session.user?.role === "admin" && (
                <Link href="/admin" className="hover:text-accent">
                  Admin
                </Link>
              )}
              <Link href="/profile" className="hover:text-accent">
                Profile
              </Link>
              <button onClick={() => signOut()} className="hover:text-accent">
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="hover:text-accent">
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}