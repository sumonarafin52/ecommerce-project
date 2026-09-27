// app/admin/returns/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const STATUS_TONE = {
  requested: "warning",
  approved: "info",
  rejected: "danger",
  received: "accent",
  refunded: "success",
};

const REASON_LABELS = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item sent",
  not_as_described: "Not as described",
  size_fit: "Size or fit issue",
  changed_mind: "Changed my mind",
  other: "Other",
};

// What each status can move to next, and how to label that action.
const ACTIONS = {
  requested: [
    { to: "approved", label: "Approve", style: "bg-accent text-white hover:bg-accent/90" },
    { to: "rejected", label: "Reject", style: "border border-rose-300 text-rose-600 hover:bg-rose-50" },
  ],
  approved: [
    { to: "received", label: "Mark item received", style: "bg-accent text-white hover:bg-accent/90" },
    { to: "rejected", label: "Reject", style: "border border-rose-300 text-rose-600 hover:bg-rose-50" },
  ],
  received: [{ to: "refunded", label: "Mark refunded", style: "bg-emerald-600 text-white hover:bg-emerald-700" }],
};

const FILTERS = ["all", "requested", "approved", "received", "refunded", "rejected"];

export default function AdminReturnsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("requested");
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState("");

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ scope: "all" });
    if (filter !== "all") qs.set("status", filter);
    fetch(`/api/returns?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => res.success && setReturns(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!permLoading && can("orders")) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, permLoading]);

  const move = async (ret, to) => {
    if (to === "rejected" && !notes[ret._id]?.trim()) {
      toast.error("Add a short note explaining why — the customer will see it");
      return;
    }
    setBusyId(ret._id);
    try {
      const res = await fetch(`/api/returns/${ret._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, adminNote: notes[ret._id] || "" }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success(
        to === "received" ? "Marked received — stock restored" : to === "refunded" ? "Marked refunded" : `Return ${to}`
      );
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't update the return");
    }
    setBusyId("");
  };

  if (permLoading) return null;
  if (!can("orders")) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
        <p className="admin-text-secondary text-sm">You don&apos;t have permission to view returns.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Returns"
        description="Review return requests. Stock is added back automatically when you mark an item received."
      />

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b admin-border mb-5">
        {FILTERS.map((f) => (
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
          {[0, 1, 2].map((i) => (
            <div key={i} className="admin-card rounded-xl h-32 animate-pulse" />
          ))}
        </div>
      ) : returns.length === 0 ? (
        <EmptyState
          icon="↩️"
          title={filter === "requested" ? "No returns waiting for review" : "No returns here"}
          description="Customers can request a return within 7 days of delivery."
        />
      ) : (
        <div className="space-y-3">
          {returns.map((r) => {
            const actions = ACTIONS[r.status] || [];
            return (
              <div key={r._id} className="admin-card rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/orders/${r.order}`} className="font-bold admin-text-primary hover:text-accent">
                        Order #{r.orderNumber}
                      </Link>
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </div>
                    <p className="text-xs admin-text-muted mt-1">
                      {r.user?.name || "Customer"} · {r.user?.email} · {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs admin-text-muted">Refund value</p>
                    <p className="font-bold admin-text-primary">{formatCurrency(r.refundAmount)}</p>
                  </div>
                </div>

                <div className="text-sm admin-text-secondary space-y-1">
                  {r.items.map((it, i) => (
                    <p key={i}>
                      {it.name} × {it.quantity} <span className="admin-text-muted">({formatCurrency(it.price)} each)</span>
                    </p>
                  ))}
                </div>

                <div className="text-sm">
                  <span className="font-semibold admin-text-primary">{REASON_LABELS[r.reason] || r.reason}</span>
                  {r.details && <p className="admin-text-secondary mt-1 whitespace-pre-line">&ldquo;{r.details}&rdquo;</p>}
                </div>

                {r.status === "received" && (
                  <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                    Issue the {formatCurrency(r.refundAmount)} refund from the{" "}
                    <Link href={`/admin/orders/${r.order}`} className="font-bold underline">
                      order page
                    </Link>
                    , then mark this return refunded.
                  </p>
                )}

                {r.adminNote && !actions.length && (
                  <p className="text-xs admin-text-muted">Note: {r.adminNote}</p>
                )}

                {actions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      className="admin-input flex-1 min-w-[180px] rounded-lg px-3 py-2 text-sm"
                      placeholder="Note to customer (required to reject)"
                      value={notes[r._id] ?? r.adminNote ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r._id]: e.target.value }))}
                    />
                    {actions.map((a) => (
                      <button
                        key={a.to}
                        onClick={() => move(r, a.to)}
                        disabled={busyId === r._id}
                        className={`text-xs font-bold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50 ${a.style}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
