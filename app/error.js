// app/error.js
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }) {
  useEffect(() => {
    // Surfaced in server/browser logs so real failures are diagnosable.
    // Swap this for your monitoring service (Sentry etc.) when you add one.
    console.error("[page error]", error);
  }, [error]);

  return (
    <div className="bg-cream-bg min-h-[70vh] flex items-center justify-center px-4 font-body2">
      <div className="text-center max-w-md">
        <span className="text-4xl">⚠️</span>
        <h1 className="font-display text-2xl font-semibold text-ink mt-3">Something went wrong</h1>
        <p className="text-sm text-ink-muted mt-2">
          This is on our side, not yours. Try again in a moment — if it keeps happening, please contact support.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg text-sm transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border-[1.5px] border-line hover:border-indigo-700 text-ink-soft hover:text-indigo-900 font-bold px-6 py-3 rounded-lg text-sm transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
