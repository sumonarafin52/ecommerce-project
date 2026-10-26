// app/admin/products/performance/page.js
//
// What a sales report cannot tell you: which products people are looking
// at and walking away from.
//
// A product with four hundred views and two sales has a problem with its
// price, its photographs or its description. In a sales report it is
// indistinguishable from a product nobody has ever seen — both just look
// like slow sellers, and only one of them is a fixable problem.
//
// Two honesty rules run through this page. A rate is only shown when there
// are enough views to mean something, and the counts are described for
// what they are: best-effort signals from the browser, next to sales
// figures that come from the order record.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";
import Badge from "@/components/admin/ui/Badge";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency } from "@/lib/utils";
import FilterChips from "@/components/admin/ui/FilterChips";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

const SORTS = [
  { key: "views", label: "Most viewed" },
  { key: "worst", label: "Worst converting" },
  { key: "units", label: "Best selling" },
  { key: "revenue", label: "Most revenue" },
];

export default function ProductPerformancePage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [loadError, setLoadError] = useState(false);
  const [days, setDays] = useState("30");
  const [sort, setSort] = useState("views");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const to = new Date();
    const from = new Date(Date.now() - (parseInt(days) - 1) * 864e5);
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), sort });
    setLoadError(false);
    fetch(`/api/admin/products/performance?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setData(res.data) : setLoadError(true)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [days, sort]);

  useEffect(() => {
    if (permLoading) return;
    if (!can("products") && !can("reports")) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, days, sort]);

  if (permLoading || permFailed || (!can("products") && !can("reports"))) {
    return (
      <PermissionGate
        perm="products"
        what="product performance"
        state={{
          loading: permLoading,
          failed: permFailed,
          // this page opens to either permission, so the gate asks the
          // question the page actually asks
          can: () => can("products") || can("reports"),
          refresh: refreshPermissions,
        }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="product performance" onRetry={() => { setLoadError(false); load(); }} />;
  }

  const rows = data?.rows || [];
  const totals = data?.totals || { views: 0, addToCart: 0, units: 0 };
  const minViews = data?.minViewsForRate ?? 20;

  // A dash, not a zero: under the threshold there is nothing to say, and
  // "0%" reads like a finding.
  const rate = (value) => (value === null ? <span className="admin-text-muted">—</span> : `${value}%`);

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Performance" }]}
        title="Product Performance"
        description="Which products get looked at, and which of those get bought. Views and baskets are counted in the shop; units sold come from your orders."
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterChips ariaLabel="Date range" options={RANGES} value={days} onChange={setDays} />
        <span className="admin-border border-l h-5 mx-1" />
        <FilterChips ariaLabel="Sort by" options={SORTS} value={sort} onChange={setSort} />
      </div>

      {loading ? (
        <div className="admin-card rounded-xl h-80 animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="chart"
            title="Nothing recorded yet"
            description="Views are counted as shoppers browse. Come back once the store has had some visitors in this period."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label: "Product views", value: totals.views.toLocaleString(), sub: "once per shopper per visit" },
              { label: "Added to basket", value: totals.addToCart.toLocaleString(), sub: "across all products" },
              { label: "Units sold", value: totals.units.toLocaleString(), sub: "from paid orders" },
            ].map((c) => (
              <div key={c.label} className="admin-card rounded-xl p-5">
                <p className="text-xs admin-text-muted font-bold uppercase tracking-wide">{c.label}</p>
                <p className="text-2xl font-bold admin-text-primary mt-1">{c.value}</p>
                <p className="text-[11px] admin-text-muted mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {data.attention?.length > 0 && (
            <div className="admin-card rounded-xl p-5 mb-5 border-l-4 border-l-[#F59E0B]">
              <h2 className="text-sm font-bold admin-text-primary">Looked at, never bought</h2>
              <p className="text-xs admin-text-muted mt-1 mb-3">
                At least {minViews} views in this period and not one sale. Usually the price, the photographs or the
                description — worth opening each one.
              </p>
              <div className="flex flex-wrap gap-2">
                {data.attention.map((r) => (
                  <Link
                    key={r._id}
                    href={`/admin/products?search=${encodeURIComponent(r.name)}`}
                    className="inline-flex items-center gap-2 border admin-border hover:border-accent rounded-lg px-3 py-1.5 text-xs font-bold admin-text-secondary hover:text-accent transition-colors"
                  >
                    {r.name}
                    <span className="admin-text-muted font-normal">{r.views} views</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="admin-card rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b admin-border text-left admin-text-muted text-xs">
                  <th className="py-3 px-4 font-bold">Product</th>
                  <th className="py-3 px-3 font-bold text-right">Views</th>
                  <th className="py-3 px-3 font-bold text-right">In basket</th>
                  <th className="py-3 px-3 font-bold text-right">Basket rate</th>
                  <th className="py-3 px-3 font-bold text-right">Sold</th>
                  <th className="py-3 px-3 font-bold text-right">Buy rate</th>
                  <th className="py-3 px-4 font-bold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-b admin-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold admin-text-primary">{r.name}</span>
                        {r.status !== "public" && <Badge tone="neutral">{r.status}</Badge>}
                        {r.stock <= 0 && <Badge tone="danger">out of stock</Badge>}
                      </div>
                      <span className="text-[11px] admin-text-muted">{r.category}</span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums admin-text-secondary">{r.views.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums admin-text-secondary">{r.addToCart.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums admin-text-secondary">{rate(r.cartRate)}</td>
                    <td className="py-3 px-3 text-right tabular-nums admin-text-primary font-semibold">{r.units.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      <span className={r.buyRate !== null && r.buyRate === 0 ? "text-[#8E0B21] font-bold" : "admin-text-secondary"}>
                        {rate(r.buyRate)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums admin-text-primary">{formatCurrency(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] admin-text-muted mt-3 max-w-3xl">
            Rates are shown only for products with at least {minViews} views in the period — below that the number moves
            too much to act on. Views and basket counts are best-effort signals recorded as people browse, and are for
            comparing products with each other; every money figure on this page comes from your orders.
          </p>
        </>
      )}
    </div>
  );
}
