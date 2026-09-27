// app/not-found.js
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-cream-bg min-h-[70vh] flex items-center justify-center px-4 font-body2">
      <div className="text-center max-w-md">
        <p className="font-display text-6xl font-bold text-indigo-900/20">404</p>
        <h1 className="font-display text-2xl font-semibold text-ink mt-2">We couldn&apos;t find that page</h1>
        <p className="text-sm text-ink-muted mt-2">
          The link may be broken, or the product may no longer be available.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-6">
          <Link
            href="/"
            className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg text-sm transition-colors"
          >
            Back to home
          </Link>
          <Link
            href="/products"
            className="border-[1.5px] border-line hover:border-indigo-700 text-ink-soft hover:text-indigo-900 font-bold px-6 py-3 rounded-lg text-sm transition-colors"
          >
            Browse products
          </Link>
        </div>
      </div>
    </div>
  );
}
