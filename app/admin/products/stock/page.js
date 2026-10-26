// app/admin/products/stock/page.js
//
// Where the stock went.
//
// Every change to a stock number now leaves a row: how many, which way,
// what caused it, and what the number was left at. Before this, six
// different parts of the system changed stock anonymously and the only way
// to investigate a number that looked wrong was to guess.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";
import Badge from "@/components/admin/ui/Badge";
import usePermissions from "@/lib/usePermissions";
import { formatDateTime } from "@/lib/utils";
// From the pure module, never the model: importing the model here would
// pull mongoose into the browser bundle and crash this page.
import { STOCK_REASONS, STOCK_REASON_LABELS } from "@/lib/stockReasons";
import FilterChips from "@/components/admin/ui/FilterChips";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const FILTERS = [
  { key: "", label: "Everything" },
  { key: STOCK_REASONS.SALE, label: "Sold" },
  { key: STOCK_REASONS.RETURNED, label: "Returned" },
  { key: STOCK_REASONS.CANCELLED, label: "Cancelled" },
  { key: STOCK_REASONS.PAYMENT_FAILED, label: "Payment failed" },
  { key: STOCK_REASONS.MANUAL, label: "Changed by staff" },
];

const TONE = {
  [STOCK_REASONS.SALE]: "info",
  [STOCK_REASONS.RETURNED]: "success",
  [STOCK_REASONS.CANCELLED]: "warning",
  [STOCK_REASONS.PAYMENT_FAILED]: "danger",
  [STOCK_REASONS.MANUAL]: "accent",
  [STOCK_REASONS.CREATED]: "neutral",
};

export default function StockHistoryPage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [loadError, setLoadError] = useState(false);
  const [reason, setReason] = useState("");
  const [productId, setProductId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // A product can be linked to directly from its row, so the page opens
  // already filtered when somebody arrives from elsewhere.
  useEffect(() => {
    setProductId(new URLSearchParams(window.location.search).get("product") || "");
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (reason) qs.set("reason", reason);
    if (productId) qs.set("product", productId);
    setLoadError(false);
    fetch(`/api/admin/stock?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setData(res.data) : setLoadError(true)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reason, productId]);

  useEffect(() => {
    if (permLoading || !can("products")) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, reason, productId]);
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
    return <ErrorState what="stock history" onRetry={() => { setLoadError(false); load(); }} />;
  }

  const rows = data?.movements || [];
  const integrity = data?.integrity;

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Stock history" }]}
        title={data?.product ? `Stock history — ${data.product.name}` : "Stock history"}
        description="Every change to a stock number, and what caused it."
        action={
          productId && (
            <button
              onClick={() => {
                setProductId("");
                window.history.replaceState({}, "", "/admin/products/stock");
              }}
              className="border admin-border hover:border-accent admin-text-secondary hover:text-accent text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
            >
              Show all products
            </button>
          )
        }
      />

      {/* The integrity check, shown only for a single product — across the
          whole shop it would be a number with nowhere to go. */}
      {integrity && (
        <div
          className={`admin-card rounded-xl p-5 mb-5 border-l-4 ${
            integrity.state === "ok"
              ? "border-l-[#0C5132]"
              : integrity.state === "mismatch"
              ? "border-l-[#8E0B21]"
              : "border-l-[#8A8A8A]"
          }`}
        >
          <h2 className="text-sm font-bold admin-text-primary">
            {integrity.state === "ok"
              ? "The history adds up"
              : integrity.state === "mismatch"
              ? "Stock moved without being recorded"
              : "History starts partway through"}
          </h2>
          <div className="mt-2 space-y-1">
            {integrity.lines.map((l) => (
              <p key={l.key || "base"} className="text-xs admin-text-secondary">
                {l.key ? <span className="font-bold">{l.key}: </span> : null}
                in stock <span className="font-bold admin-text-primary">{l.actual}</span>, history accounts for{" "}
                <span className="font-bold admin-text-primary">{l.ledger}</span>
                {!l.agrees && (
                  <span className={integrity.state === "mismatch" ? "text-[#8E0B21] font-bold" : "admin-text-muted"}>
                    {" "}
                    — {Math.abs(l.actual - l.ledger)} {integrity.state === "mismatch" ? "unexplained" : "from before"}
                  </span>
                )}
              </p>
            ))}
          </div>
          <p className="text-[11px] admin-text-muted mt-2">{integrity.note}</p>
        </div>
      )}

      <FilterChips
        ariaLabel="Filter by reason"
        className="mb-4"
        options={FILTERS}
        value={reason}
        onChange={setReason}
      />

      {loading ? (
        <div className="admin-card rounded-xl h-80 animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="package"
            title="No stock movements yet"
            description="Changes are recorded from now on — a sale, a return, a cancellation, or an edit on the product page."
          />
        </div>
      ) : (
        <div className="admin-card rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b admin-border text-left admin-text-muted text-xs">
                <th className="py-3 px-4 font-bold">When</th>
                <th className="py-3 px-3 font-bold">Product</th>
                <th className="py-3 px-3 font-bold">Why</th>
                <th className="py-3 px-3 font-bold text-right">Change</th>
                <th className="py-3 px-3 font-bold text-right">Left at</th>
                <th className="py-3 px-4 font-bold">Who / what</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m._id} className="border-b admin-border last:border-0 hover:bg-[#FAFAFA]">
                  <td className="py-3 px-4 admin-text-muted text-xs whitespace-nowrap">{formatDateTime(m.at)}</td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/admin/products/stock?product=${m.product._id}`}
                      onClick={() => setProductId(m.product._id)}
                      className="font-semibold admin-text-primary hover:text-accent"
                    >
                      {m.product.name}
                    </Link>
                    {m.combinationKey && <span className="block text-[11px] admin-text-muted">{m.combinationKey}</span>}
                  </td>
                  <td className="py-3 px-3">
                    <Badge tone={TONE[m.reason] || "neutral"}>{STOCK_REASON_LABELS[m.reason] || m.reason}</Badge>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold">
                    {/* Sign carried explicitly: "12" alone doesn't say
                        whether twelve arrived or twelve left. */}
                    <span className={m.delta < 0 ? "text-[#8E0B21]" : "text-[#0C5132]"}>
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums admin-text-secondary">
                    {m.balanceAfter === null ? <span className="admin-text-muted">—</span> : m.balanceAfter}
                  </td>
                  <td className="py-3 px-4 text-xs admin-text-secondary">
                    {m.order?.orderNumber ? (
                      <Link href={`/admin/orders/${m.order._id}`} className="font-bold text-accent hover:underline">
                        {m.order.orderNumber}
                      </Link>
                    ) : (
                      m.by || "System"
                    )}
                    {m.note && <span className="block admin-text-muted">{m.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
