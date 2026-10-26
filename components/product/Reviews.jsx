// components/product/Reviews.jsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
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

const SORTS = [
  ["helpful", "Most helpful"],
  ["recent", "Newest"],
  ["highest", "Highest rated"],
  ["lowest", "Lowest rated"],
];

const REPORT_REASONS = [
  ["spam", "Spam or advertising"],
  ["offensive", "Offensive or abusive"],
  ["off_topic", "Not about this product"],
  ["fake", "Looks fake"],
  ["other", "Something else"],
];

export default function Reviews({ productId }) {
  const { data: session } = useSession();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("helpful");
  const [voting, setVoting] = useState("");
  const [reporting, setReporting] = useState(null); // the review being reported

  const load = useCallback(() => {
    if (!productId) return;
    fetch(`/api/reviews?product=${productId}&sort=${sort}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setReviews(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, sort]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const voteHelpful = async (review) => {
    if (!session) {
      toast("Sign in to mark a review as helpful");
      return;
    }
    setVoting(review._id);
    // Optimistic: the vote is a toggle and the server returns the real count,
    // so a failure simply reverts on the next render.
    try {
      const res = await fetch(`/api/reviews/${review._id}/helpful`, { method: "POST" }).then((r) => r.json());
      if (res.success) {
        setReviews((list) =>
          list.map((r) =>
            r._id === review._id
              ? { ...r, helpfulCount: res.data.helpfulCount, viewerFoundHelpful: res.data.viewerFoundHelpful }
              : r
          )
        );
      } else {
        toast.error(res.message || "Couldn't record that");
      }
    } catch {
      toast.error("Network problem — please try again");
    }
    setVoting("");
  };

  const submitReport = async (reason, note) => {
    const review = reporting;
    setReporting(null);
    try {
      const res = await fetch(`/api/reviews/${review._id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      }).then((r) => r.json());
      if (res.success) {
        toast.success(res.message || "Thanks — we'll take a look.");
        setReviews((list) => list.map((r) => (r._id === review._id ? { ...r, viewerReported: true } : r)));
      } else {
        toast.error(res.message || "Couldn't send that");
      }
    } catch {
      toast.error("Network problem — please try again");
    }
  };

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="bg-cream-white border border-line rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="font-display text-lg font-semibold text-indigo-950 flex items-center gap-2">
          <span className="w-1 h-5 bg-gold rounded-full" />
          Customer Reviews
        </h2>
        {reviews.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Stars n={avg} />
              <span className="text-sm font-bold text-indigo-900">{avg.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">
                ({reviews.length} review{reviews.length === 1 ? "" : "s"})
              </span>
            </div>
            {reviews.length > 1 && (
              <label>
                <span className="sr-only">Sort reviews</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-indigo-900 focus:outline-none"
                >
                  {SORTS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          No reviews yet — only verified buyers can review, and theirs will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r._id} className="bg-cream-alt/50 border border-line rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-700/20 flex items-center justify-center text-indigo-900 font-extrabold shrink-0">
                  {r.user?.name?.charAt(0).toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink">{r.user?.name || "Customer"}</p>
                  <p className="text-[11px] text-ink-muted">{formatDate(r.createdAt)}</p>
                </div>
                <Stars n={r.rating} />
              </div>

              {/* Driven by the stored flag rather than printed on every review
                  regardless — the badge only means something if it can be absent. */}
              {r.verifiedPurchase && (
                <span className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Verified purchase
                </span>
              )}

              {r.comment && <p className="text-sm text-ink-soft mt-3 leading-relaxed">{r.comment}</p>}

              {/* public reply from the store */}
              {r.reply && (
                <div className="mt-3 ml-3 pl-4 border-l-2 border-gold/50">
                  <p className="text-[12px] font-bold text-indigo-900">{r.repliedBy || "Store"} replied</p>
                  <p className="text-sm text-ink-soft mt-1 leading-relaxed whitespace-pre-line">{r.reply}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5">
                {r.viewerIsAuthor ? (
                  <span className="text-[11px] font-semibold text-ink-muted">Your review</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => voteHelpful(r)}
                    disabled={voting === r._id}
                    aria-pressed={r.viewerFoundHelpful}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                      r.viewerFoundHelpful
                        ? "border-indigo-900 bg-indigo-100 text-indigo-900"
                        : "border-line text-ink-soft hover:border-indigo-700/40"
                    }`}
                  >
                    {/* the count lives in the sentence beside this, so the
                        button doesn't repeat it */}
                    {r.viewerFoundHelpful ? "Helpful ✓" : "Helpful"}
                  </button>
                )}

                {r.helpfulCount > 0 && (
                  <span className="text-[11px] text-ink-muted">
                    {r.helpfulCount} {r.helpfulCount === 1 ? "person" : "people"} found this helpful
                  </span>
                )}

                {!r.viewerIsAuthor && (
                  <button
                    type="button"
                    onClick={() => (session ? setReporting(r) : toast("Sign in to report a review"))}
                    disabled={r.viewerReported}
                    className="ml-auto text-[11px] font-semibold text-ink-muted hover:text-ink disabled:opacity-60"
                  >
                    {r.viewerReported ? "Reported" : "Report"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {reporting && <ReportDialog onCancel={() => setReporting(null)} onSubmit={submitReport} />}
    </section>
  );
}

// Small focused modal — a reason and an optional note is all an admin needs
// to judge the report.
function ReportDialog({ onCancel, onSubmit }) {
  const [reason, setReason] = useState("spam");
  const [note, setNote] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Report this review"
      onClick={onCancel}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason, note);
        }}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-cream-white p-5"
      >
        <div>
          <h3 className="text-base font-bold text-ink">Report this review</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            We&apos;ll have a look. Reporting doesn&apos;t remove a review on its own.
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="sr-only">Reason</legend>
          {REPORT_REASONS.map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="accent-indigo-900"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Anything to add? (optional)</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="mt-1 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-indigo-900 focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-line px-4 py-2 text-xs font-bold text-ink-soft hover:bg-cream-alt"
          >
            Cancel
          </button>
          <button type="submit" className="flex-1 rounded-lg bg-indigo-900 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-800">
            Send report
          </button>
        </div>
      </form>
    </div>
  );
}
