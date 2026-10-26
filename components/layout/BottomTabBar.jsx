// components/layout/BottomTabBar.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import useCartStore from "@/store/cartStore";
import useWishlistStore from "@/store/wishlistStore";
import { useT } from "@/components/LanguageProvider";

// Pages where the tab bar would get in the way: product detail has its own
// sticky buy bar, and checkout should keep the shopper focused.
export function showsTabBar(pathname = "") {
  if (/^\/products\/[^/]+/.test(pathname)) return false;
  if (pathname.startsWith("/checkout")) return false;
  return true;
}

const icons = {
  home: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z",
  categories: "M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z",
  cart: "M3 4h2l2.4 11.2a1 1 0 001 .8h9.2a1 1 0 001-.8L20 8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z",
  wishlist: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  account: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
};

function Tab({ href, label, icon, active, badge }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 transition-colors ${
        active ? "text-indigo-900" : "text-ink-muted active:text-indigo-900"
      }`}
    >
      {/* active indicator */}
      <span
        className={`absolute top-0 h-[3px] rounded-b-full bg-indigo-900 transition-all duration-300 ${active ? "w-8 opacity-100" : "w-0 opacity-0"}`}
        aria-hidden="true"
      />
      <span className="relative">
        <svg
          className={`w-6 h-6 transition-transform duration-200 ${active ? "scale-110" : ""}`}
          fill={active && icon !== "categories" ? "currentColor" : "none"}
          fillOpacity={active ? 0.12 : 0}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d={icons[icon]} />
        </svg>
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-brick text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-cream-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className={`text-[10.5px] leading-none ${active ? "font-bold" : "font-semibold"}`}>{label}</span>
    </Link>
  );
}

export default function BottomTabBar() {
  const pathname = usePathname() || "/";
  const { data: session } = useSession();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const wishCount = useWishlistStore((s) => s.ids.size);
  const t = useT();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!showsTabBar(pathname)) return null;

  const accountHref = session ? "/profile" : "/login";

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-cream-white/95 backdrop-blur-md border-t border-line shadow-[0_-4px_20px_rgba(30,58,95,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch h-[60px]">
        <Tab href="/" label={t("home")} icon="home" active={pathname === "/"} />
        <Tab
          href="/categories"
          label={t("categories")}
          icon="categories"
          active={pathname.startsWith("/categories") || pathname === "/products"}
        />
        <Tab href="/cart" label={t("cart")} icon="cart" active={pathname.startsWith("/cart")} badge={hydrated ? cartCount : 0} />
        <Tab href="/wishlist" label={t("wishlist")} icon="wishlist" active={pathname.startsWith("/wishlist")} badge={hydrated ? wishCount : 0} />
        <Tab
          href={accountHref}
          label={session ? t("account") : t("signIn")}
          icon="account"
          active={pathname.startsWith("/profile") || pathname === "/login"}
        />
      </div>
    </nav>
  );
}
