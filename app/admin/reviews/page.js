// app/admin/reviews/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import usePermissions from "@/lib/usePermissions";
import { formatDateTime } from "@/lib/utils";
import { productPath } from "@/lib/slug";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const REPORT_LABELS = {
  spam: "Spam or advertising",
  offensive: "Offensive or abusive",
  off_topic: "Not about this product",
  fake: "Looks fake",
  other: "Other",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "hidden", label: "Hidden" },
  { key: "unanswered", label: "Not replied" },
  { key: "reported", label: "Reported" },
  { key: "low", label: "1–2 star" },
];

export default function AdminReviewsPage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");

  const load = () => {
    const qs = new URLSearchParams();
    if (filter === "published" || filter === "hidden") qs.set("status", filter);
    if (filter === "unanswered") qs.set("unanswered", "1");
    if (filter === "reported") qs.set("reported", "1");
    if (filter === "low") qs.set("rating", "1");
    setLoadError(false);
    fetch(`/api/admin/reviews?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setData(res.data) : setLoadError(true)))
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    if (!permLoading && can("products")) {
      setData(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, permLoading]);

  const update = async (review, body, msg) => {
    setBusyId(review._id);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review._id, ...body }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success(msg);
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't update the review");
    }
    setBusyId("");
  };

  const remove = async (review) => {
    if (!window.confirm("Delete this review permanently? The product's rating will be recalculated.")) return;
    setBusyId(review._id);
    try {
      const res = await fetch(`/api/admin/reviews?id=${review._id}`, { method: "DELETE" }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Review deleted");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't delete the review");
    }
    setBusyId("");
  };
  if (permLoading || permFailed || !can("products")) {
    return (
      <PermissionGate
        perm="products"
        what="products"
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="reviews" onRetry={() => { setLoadError(false); load(); }} />;
  }

  // the "1–2 star" filter asks the API for 1-star; narrow to 1–2 here
  const reviews = (data?.reviews || []).filter((r) => (filter === "low" ? r.rating <= 2 : true));

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Reviews"
        description="Customer reviews from product pages. Hiding a review also removes it from the product's rating."
      />

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b admin-border mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              filter === f.key ? "border-accent text-accent" : "border-transparent admin-text-secondary"
            }`}
          >
            {f.label}
            {f.key === "hidden" && data?.counts?.hidden > 0 && (
              <span className="ml-1.5 text-[11px] admin-text-muted">{data.counts.hidden}</span>
            )}
            {/* Reports queue for a human to judge — reporting never hides a
                review on its own, so this badge is the only thing that
                surfaces them. */}
            {f.key === "reported" && data?.reportedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {data.reportedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="admin-card rounded-xl h-32 animate-pulse" />)}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState icon="star" title="No reviews here" description="Reviews customers leave on product pages appear here." />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r._id} className={`admin-card rounded-xl p-5 ${r.status === "hidden" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-amber-500 text-sm" aria-label={`${r.rating} out of 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-[#D5D5D5]">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    {r.status === "hidden" && <Badge tone="neutral">hidden</Badge>}
                    {!r.reply && <Badge tone="warning">not replied</Badge>}
                    {r.reports?.length > 0 && !r.reportsResolvedAt && (
                      <Badge tone="danger">
                        {r.reports.length} report{r.reports.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                    {r.helpfulCount > 0 && <Badge tone="neutral">{r.helpfulCount} found helpful</Badge>}
                  </div>
                  {r.product ? (
                    <Link href={productPath(r.product)} target="_blank" className="text-xs font-bold text-accent hover:underline mt-1 inline-block">
                      {r.product.name}
                    </Link>
                  ) : (
                    <span className="text-xs admin-text-muted">(product deleted)</span>
                  )}
                  <p className="text-xs admin-text-muted mt-0.5">
                    {r.user?.name || "Customer"} · {r.user?.email} · {formatDateTime(r.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => update(r, { status: r.status === "hidden" ? "published" : "hidden" }, r.status === "hidden" ? "Review published" : "Review hidden")}
                    disabled={busyId === r._id}
                    className="text-xs font-bold border admin-border px-3 py-1.5 rounded-lg admin-text-secondary disabled:opacity-50"
                  >
                    {r.status === "hidden" ? "Publish" : "Hide"}
                  </button>
                  <button
                    onClick={() => remove(r)}
                    disabled={busyId === r._id}
                    className="text-xs font-bold border border-rose-300 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {r.comment && <p className="text-sm admin-text-primary mt-3 whitespace-pre-line">{r.comment}</p>}

              {/* What customers actually reported, and who. Shown in full so
                  the decision is made on the reports themselves rather than
                  on a count — a cluster of identical reports from new
                  accounts reads very differently from one detailed one. */}
              {r.reports?.length > 0 && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-rose-900">
                      Reported by {r.reports.length} customer{r.reports.length === 1 ? "" : "s"}
                      {r.reportsResolvedAt && " · already reviewed by staff"}
                    </p>
                    {!r.reportsResolvedAt && (
                      <button
                        onClick={() => update(r, { dismissReports: true }, "Marked as checked — the review stays up")}
                        disabled={busyId === r._id}
                        className="rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Keep this review
                      </button>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {r.reports.map((rep, i) => (
                      <li key={i} className="text-[11px] text-rose-900/80">
                        <span className="font-bold">{REPORT_LABELS[rep.reason] || rep.reason}</span> — {rep.by}
                        {rep.note ? `: "${rep.note}"` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 pt-3 border-t admin-border">
                {r.reply && (
                  <p className="text-xs admin-text-muted mb-1.5">
                    Replied by {r.repliedBy} · {formatDateTime(r.repliedAt)}
                  </p>
                )}
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={drafts[r._id] ?? r.reply ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r._id]: e.target.value }))}
                  placeholder="Reply publicly — shown under this review on the product page"
                  className="admin-input w-full"
                />
                <div className="flex justify-end gap-2 mt-2">
                  {r.reply && (
                    <button
                      onClick={() => update(r, { reply: "" }, "Reply removed")}
                      disabled={busyId === r._id}
                      className="text-xs font-bold admin-text-secondary px-3 py-1.5 disabled:opacity-50"
                    >
                      Remove reply
                    </button>
                  )}
                  <button
                    onClick={() => update(r, { reply: drafts[r._id] ?? r.reply ?? "" }, "Reply saved")}
                    disabled={busyId === r._id || !(drafts[r._id] ?? r.reply ?? "").trim()}
                    className="text-xs font-bold bg-accent text-white hover:bg-accent/90 px-3.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {r.reply ? "Update reply" : "Reply"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
