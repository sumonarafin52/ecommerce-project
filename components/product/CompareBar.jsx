// components/product/CompareBar.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useCompareStore, { COMPARE_MAX } from "@/store/compareStore";

export default function CompareBar() {
  const ids = useCompareStore((s) => s.ids);
  const clear = useCompareStore((s) => s.clear);
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);

  // persisted store rehydrates client-side; avoid a server/client mismatch
  useEffect(() => setHydrated(true), []);

  if (!hydrated || ids.length === 0 || pathname === "/compare") return null;

  // product pages have their own sticky buy bar on mobile — don't stack two
  const onProductPage = pathname.startsWith("/products/");

  return (
    <div
      className={`fixed z-40 left-1/2 -translate-x-1/2 bottom-4 animate-fade-up ${onProductPage ? "hidden md:flex" : "flex"}`}
    >
      <div className="flex items-center gap-3 bg-indigo-950 text-white rounded-full shadow-premium pl-5 pr-2 py-2">
        <span className="text-sm font-semibold whitespace-nowrap">
          ⚖️ {ids.length} of {COMPARE_MAX} to compare
        </span>
        <button onClick={clear} className="text-xs text-white/60 hover:text-white px-1" aria-label="Clear compare list">
          Clear
        </button>
        <Link
          href="/compare"
          className={`text-sm font-bold rounded-full px-4 py-1.5 transition-colors ${
            ids.length >= 2 ? "bg-gold text-indigo-950 hover:bg-gold-dark" : "bg-white/15 text-white/70"
          }`}
        >
          {ids.length >= 2 ? "Compare now" : "Add one more"}
        </Link>
      </div>
    </div>
  );
}
