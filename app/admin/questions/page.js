// app/admin/questions/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import usePermissions from "@/lib/usePermissions";
import { formatDateTime } from "@/lib/utils";

const TONE = { pending: "warning", published: "success", hidden: "neutral" };

export default function AdminQuestionsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`/api/questions${filter === "all" ? "" : `?status=${filter}`}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => res.success && setQuestions(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!permLoading && can("products")) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, permLoading]);

  const save = async (q, body, msg) => {
    setBusyId(q._id);
    try {
      const res = await fetch(`/api/questions/${q._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success(msg);
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't update");
    }
    setBusyId("");
  };

  if (permLoading) return null;
  if (!can("products")) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
        <p className="admin-text-secondary text-sm">You don&apos;t have permission to manage product questions.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Product Q&A"
        description="Customer questions from product pages. Answered questions appear publicly under the product."
      />

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b admin-border mb-5">
        {["pending", "published", "hidden", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-2.5 text-sm font-semibold capitalize whitespace-nowrap border-b-2 -mb-px transition-colors ${
              filter === f ? "border-accent text-accent" : "border-transparent admin-text-secondary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="admin-card rounded-xl h-28 animate-pulse" />)}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState icon="❓" title={filter === "pending" ? "No questions waiting" : "Nothing here"} description="Questions customers ask on product pages show up here." />
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q._id} className="admin-card rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {q.product ? (
                    <Link href={`/products/${q.product._id}`} target="_blank" className="text-xs font-bold text-accent hover:underline">
                      {q.product.name}
                    </Link>
                  ) : (
                    <span className="text-xs admin-text-muted">(product deleted)</span>
                  )}
                  <p className="font-semibold admin-text-primary mt-1">{q.question}</p>
                  <p className="text-xs admin-text-muted mt-1">
                    {q.user?.name} · {q.user?.email} · {formatDateTime(q.createdAt)}
                  </p>
                </div>
                <Badge tone={TONE[q.status]}>{q.status}</Badge>
              </div>

              <textarea
                rows={3}
                maxLength={2000}
                value={drafts[q._id] ?? q.answer ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                placeholder="Write an answer — it'll be shown publicly on the product page"
                className="admin-input w-full rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                {q.status !== "hidden" && (
                  <button
                    onClick={() => save(q, { status: "hidden" }, "Question hidden")}
                    disabled={busyId === q._id}
                    className="text-xs font-bold border admin-border px-3.5 py-2 rounded-lg admin-text-secondary disabled:opacity-50"
                  >
                    Hide
                  </button>
                )}
                <button
                  onClick={() => save(q, { answer: drafts[q._id] ?? q.answer }, q.answer ? "Answer updated" : "Answered and published")}
                  disabled={busyId === q._id || (drafts[q._id] ?? q.answer ?? "").trim().length < 2}
                  className="text-xs font-bold bg-accent text-white hover:bg-accent/90 px-3.5 py-2 rounded-lg disabled:opacity-50"
                >
                  {q.answer ? "Update answer" : "Answer & publish"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
