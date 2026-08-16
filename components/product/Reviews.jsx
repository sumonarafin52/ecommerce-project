// components/product/Reviews.jsx
"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

const Stars = ({ n, size = "w-4 h-4" }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} className={`${size} ${i <= Math.round(n) ? "text-gold" : "text-line"}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
      </svg>
    ))}
  </div>
);

export default function Reviews({ productId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    fetch(`/api/reviews?product=${productId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setReviews(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="bg-cream-white border border-line rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="font-display text-lg font-semibold text-indigo-950 flex items-center gap-2">
          <span className="w-1 h-5 bg-gold rounded-full" />
          Customer Reviews
        </h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2">
            <Stars n={avg} />
            <span className="text-sm font-bold text-indigo-900">{avg.toFixed(1)}</span>
            <span className="text-xs text-ink-muted">({reviews.length} reviews)</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-cream-alt animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8 border border-dashed border-line rounded-lg">
          No reviews yet — verified buyers review dile ekhane dekhabe.
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r._id} className="bg-cream-alt/50 border border-line rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-700/20 flex items-center justify-center text-indigo-900 font-extrabold shrink-0">
                  {r.user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink">{r.user?.name || "Customer"}</p>
                  <p className="text-[11px] text-ink-muted">{formatDate(r.createdAt)} • Verified Purchase</p>
                </div>
                <Stars n={r.rating} />
              </div>
              {r.comment && <p className="text-sm text-ink-soft mt-3 leading-relaxed">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
