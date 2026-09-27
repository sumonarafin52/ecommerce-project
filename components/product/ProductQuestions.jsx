// components/product/ProductQuestions.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";

export default function ProductQuestions({ productId }) {
  const { data: session } = useSession();
  const [published, setPublished] = useState([]);
  const [mine, setMine] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = () =>
    fetch(`/api/products/${productId}/questions`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setPublished(res.data.published);
          setMine(res.data.mine);
        }
      })
      .catch(() => {});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, session?.user?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${productId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success(res.message);
      setQuestion("");
      setAsking(false);
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't submit your question");
    }
    setBusy(false);
  };

  const visible = showAll ? published : published.slice(0, 4);

  return (
    <section className="bg-cream-white border border-line rounded-xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl font-semibold text-indigo-950 flex items-center gap-2">
          <span className="w-1 h-6 bg-gold rounded-full" />
          Questions &amp; answers
          {published.length > 0 && <span className="text-sm font-body2 font-normal text-ink-muted">({published.length})</span>}
        </h2>
        {!asking &&
          (session ? (
            <button
              onClick={() => setAsking(true)}
              className="text-sm font-bold text-indigo-900 border-[1.5px] border-indigo-700/30 hover:bg-indigo-100 rounded-lg px-4 py-2 transition-colors"
            >
              Ask a question
            </button>
          ) : (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/products/${productId}`)}`}
              className="text-sm font-bold text-indigo-900 hover:underline"
            >
              Sign in to ask a question
            </Link>
          ))}
      </div>

      {asking && (
        <form onSubmit={submit} className="mb-5 space-y-2 animate-fade-up">
          <textarea
            autoFocus
            rows={3}
            minLength={10}
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Does this come with a warranty? Is the size true to fit?"
            className="w-full border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-indigo-900 transition-colors"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-muted">{question.length}/500 · Answered questions appear here publicly</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking(false)} className="text-sm font-bold text-ink-muted px-3 py-2">
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || question.trim().length < 10}
                className="text-sm font-bold bg-gold hover:bg-gold-dark text-indigo-950 px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {busy ? "Sending..." : "Submit"}
              </button>
            </div>
          </div>
        </form>
      )}

      {mine.length > 0 && (
        <div className="mb-4 space-y-2">
          {mine.map((q) => (
            <div key={q._id} className="bg-gold-light/40 border border-gold/30 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-ink">Q: {q.question}</p>
              <p className="text-[12px] text-gold-dark mt-1">Awaiting an answer — we&apos;ll notify you.</p>
            </div>
          ))}
        </div>
      )}

      {published.length === 0 && mine.length === 0 ? (
        <p className="text-sm text-ink-muted">No questions yet. Have one? Ask above — we usually answer within a day.</p>
      ) : (
        <div className="divide-y divide-line">
          {visible.map((q) => (
            <div key={q._id} className="py-4 first:pt-0">
              <p className="text-sm font-semibold text-ink">Q: {q.question}</p>
              <p className="text-sm text-ink-soft mt-1.5 whitespace-pre-line">
                <span className="font-bold text-indigo-900">A:</span> {q.answer}
              </p>
              <p className="text-[11px] text-ink-muted mt-1.5">
                Asked by {q.askerName || "a customer"} · answered {formatDate(q.answeredAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {published.length > 4 && (
        <button onClick={() => setShowAll((s) => !s)} className="text-sm font-bold text-indigo-900 hover:underline mt-3">
          {showAll ? "Show fewer" : `Show all ${published.length} questions`}
        </button>
      )}
    </section>
  );
}
