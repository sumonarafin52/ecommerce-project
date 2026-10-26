// components/product/MobileFilterSheet.jsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/LanguageProvider";

export default function MobileFilterSheet({ activeCount = 0, total = 0, children }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`lg:hidden shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
          activeCount ? "bg-indigo-900 text-white border-indigo-900" : "border-line text-ink bg-cream-white"
        }`}
        aria-haspopup="dialog"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {t("filters")}
        {activeCount > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-gold text-indigo-950 text-[10px] flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={t("filters")}>
            <div className="absolute inset-0 bg-ink/50 animate-[sm-fade-in_0.2s_ease-out]" onClick={() => setOpen(false)} />
            <div
              className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col bg-cream-white rounded-t-3xl shadow-premium animate-[sm-sheet-up_0.28s_cubic-bezier(0.22,0.61,0.36,1)]"
              // a tap on any filter option navigates — close the sheet so the
              // updated results are visible straight away
              onClickCapture={(e) => {
                if (e.target.closest("a[href]")) setTimeout(() => setOpen(false), 0);
              }}
            >
              <div className="pt-2.5 pb-1 flex justify-center" aria-hidden="true">
                <span className="w-10 h-1.5 rounded-full bg-line" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3 border-b border-line">
                <h2 className="font-display text-lg font-semibold text-ink">{t("filters")}</h2>
                <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-cream-alt text-ink-soft" aria-label="Close filters">
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-5 py-4 flex-1">{children}</div>
              <div className="p-4 border-t border-line pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-xl text-sm"
                >
                  {total === 1 ? t("showOneResult") : t("showResults", { n: total })}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
