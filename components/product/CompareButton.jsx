// components/product/CompareButton.jsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import useCompareStore, { COMPARE_MAX } from "@/store/compareStore";

export default function CompareButton({ productId, className = "" }) {
  const inList = useCompareStore((s) => s.ids.includes(String(productId)));
  const toggle = useCompareStore((s) => s.toggle);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const onClick = () => {
    const ok = toggle(productId);
    if (!ok) toast.error(`You can compare up to ${COMPARE_MAX} products — remove one first`);
  };

  const active = hydrated && inList;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 text-[13px] font-bold transition-colors ${
        active ? "text-indigo-900" : "text-ink-muted hover:text-indigo-900"
      } ${className}`}
    >
      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${active ? "bg-indigo-900 border-indigo-900" : "border-line"}`}>
        {active && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {active ? "Added to compare" : "Compare"}
    </button>
  );
}
