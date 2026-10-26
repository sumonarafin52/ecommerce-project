// app/admin/products/restock/page.js
//
// What to reorder, and how urgently.
//
// "Twelve products are low" is a count, not a decision. A product with
// four left that sells one a month is fine; one with eight left that sells
// four a day is next week's emergency. This page is the difference: how
// fast each line actually moves, how long the stock on hand will last, and
// how many to order to put a month back on the shelf.
//
// Where the sales history is too thin to mean anything, it says so. A
// reorder quantity worked out from one sale in a fortnight is a guess with
// a number's confidence, and acting on it costs real money.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";
import Badge from "@/components/admin/ui/Badge";
import usePermissions from "@/lib/usePermissions";
import FilterChips from "@/components/admin/ui/FilterChips";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const WINDOWS = [
  { key: "14", label: "Last 14 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

export default function RestockPage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [loadError, setLoadError] = useState(false);
  const [days, setDays] = useState("30");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/restock?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setData(res.data) : setLoadError(true)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (permLoading || !can("products")) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, days]);
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
    return <ErrorState what="the restock list" onRetry={() => { setLoadError(false); load(); }} />;
  }

  const rows = data?.rows || [];
  const summary = data?.summary;

  // A dash, not a zero or an infinity: too little history to say.
  const dash = <span className="admin-text-muted">—</span>;

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Restock" }]}
        title="Restock"
        description="What's running out, how soon, and how many to order. Sales rates come from your own order history."
      />

      <FilterChips ariaLabel="Sales window" className="mb-5" options={WINDOWS} value={days} onChange={setDays} />

      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "Out of stock", value: summary.outOfStock, sub: "losing sales now" },
            { label: "Running out", value: summary.urgent, sub: "gone within a week" },
            { label: "Below threshold", value: summary.low, sub: "under your own limit" },
          ].map((c) => (
            <div key={c.label} className="admin-card rounded-xl p-5">
              <p className="text-xs admin-text-muted font-bold uppercase tracking-wide">{c.label}</p>
              <p className="text-2xl font-bold admin-text-primary mt-1">{c.value}</p>
              <p className="text-[11px] admin-text-muted mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="admin-card rounded-xl h-80 animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="package"
            title="Nothing needs reordering"
            description="No product is out of stock, below its threshold, or on course to run out within the next month."
          />
        </div>
      ) : (
        <>
          <div className="admin-card rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b admin-border text-left admin-text-muted text-xs">
                  <th className="py-3 px-4 font-bold">Product</th>
                  <th className="py-3 px-3 font-bold text-right">In stock</th>
                  <th className="py-3 px-3 font-bold text-right">Sold / day</th>
                  <th className="py-3 px-3 font-bold text-right">Runs out in</th>
                  <th className="py-3 px-3 font-bold text-right">Order about</th>
                  <th className="py-3 px-4 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r._id}-${r.combinationKey}`} className="border-b admin-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold admin-text-primary">{r.name}</span>
                        {r.outOfStock ? (
                          <Badge tone="danger">out of stock</Badge>
                        ) : r.urgent ? (
                          <Badge tone="warning">running out</Badge>
                        ) : r.low ? (
                          <Badge tone="info">below threshold</Badge>
                        ) : null}
                      </div>
                      <span className="text-[11px] admin-text-muted">
                        {r.category}
                        {r.combinationKey && ` · ${r.combinationKey}`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-bold admin-text-primary">{r.stock}</td>
                    <td className="py-3 px-3 text-right tabular-nums admin-text-secondary">
                      {r.perDay === null ? dash : r.perDay}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {/* A product at zero has not got a day left — it is
                          already out, and saying "under a day" of a shelf
                          that is empty reads as though there were still
                          something on it. */}
                      {r.outOfStock ? (
                        <span className="text-[#8E0B21] font-bold">already out</span>
                      ) : r.coverDays === null ? (
                        dash
                      ) : (
                        <span className={r.coverDays <= 7 ? "text-[#8E0B21] font-bold" : "admin-text-secondary"}>
                          {r.coverDays < 1 ? "under a day" : `${r.coverDays} days`}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-bold admin-text-primary">
                      {r.suggest === null ? dash : r.suggest}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/products/stock?product=${r._id}`}
                        className="text-xs font-bold text-accent hover:underline whitespace-nowrap"
                      >
                        History →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] admin-text-muted mt-3 max-w-3xl">
            Rates are measured over the last {summary?.windowDays} days and shown only where at least{" "}
            {summary?.minUnits} units sold — below that a rate swings on a single order. &quot;Order about&quot; is
            enough to put {summary?.targetDays} days of stock back, at the current rate. A dash means there isn&apos;t
            enough recent history to say.
          </p>
        </>
      )}
    </div>
  );
}
