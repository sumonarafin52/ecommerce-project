// components/auth/AuthShell.jsx
"use client";

import Link from "next/link";

export default function AuthShell({ quote, sub, stats, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-cream-white font-body2">
      <div className="hidden lg:flex relative items-center justify-center p-14 bg-gradient-to-br from-indigo-950 to-indigo-700 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1.5px, transparent 1.5px)", backgroundSize: "26px 26px" }}
        />
        <div className="relative bg-white/[0.08] border border-white/20 backdrop-blur-md rounded-[20px] p-9 text-white max-w-sm">
          <h3 className="font-display text-2xl font-semibold leading-snug">{quote}</h3>
          <p className="text-cream-bg/70 text-sm leading-relaxed mt-3">{sub}</p>
          {stats && (
            <div className="flex gap-6 mt-7">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="font-display text-xl font-bold">{s.value}</div>
                  <div className="text-xs text-cream-bg/70 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center p-8 sm:p-10">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-2xl text-indigo-900 mb-9">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-900 to-indigo-700 text-gold flex items-center justify-center text-base font-bold shrink-0">
              S
            </span>
            SumonMart
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
