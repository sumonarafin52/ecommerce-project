// app/admin/reports/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import Icon from "@/components/ui/Icon";
import BarChart from "@/components/admin/ui/BarChart";
import FilterChips from "@/components/admin/ui/FilterChips";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const inputCls = "admin-input";

const QUICK = [
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

const statusColors = {
  pending: "bg-zinc-400",
  processing: "bg-accent",
  on_hold: "bg-red-400",
  shipped: "bg-blue-400",
  delivered: "bg-green-400",
  cancelled: "bg-red-400",
  returned: "bg-amber-400",
};

export default function AdminReportsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(() => {
    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (quick === "today") return { from: startOfDay(now), to: now };
    if (quick === "7") return { from: new Date(now.getTime() - 6 * 864e5), to: now };
    if (quick === "30") return { from: new Date(now.getTime() - 29 * 864e5), to: now };
    return {
      from: from ? new Date(from) : new Date(0),
      to: to ? new Date(to + "T23:59:59") : now,
    };
  }, [quick, from, to]);

  useEffect(() => {
    if (status !== "authenticated" || !can("reports")) { setLoading(false); return; }
    // Server-computed over ALL orders in the range. This page used to pull
    // /api/orders (latest 100 only) and do the maths in the browser, so every
    // figure went quietly wrong once the store passed 100 orders.
    setLoading(true);
    const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
    setLoadError(false);
    fetch(`/api/admin/stats?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setStats(res.data);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [status, can, range]);



  const kpi = {
    orders: stats?.orders || 0,
    revenue: stats?.revenue || 0,
    todayOrders: stats?.todayOrders || 0,
    todayRevenue: stats?.todayRevenue || 0,
    weekOrders: stats?.weekOrders || 0,
    weekRevenue: stats?.weekRevenue || 0,
    avg: stats?.avgOrder || 0,
    codPending: stats?.codPending || 0,
  };

  // The server sends the series already zero-filled and already labelled,
  // in the SHOP's timezone. This page used to rebuild the days from the
  // browser's clock and match them against keys the database had bucketed
  // in UTC — so for an admin in Dhaka the labels and the bars were a day
  // apart, and a 2am order appeared under the previous date.
  const series = stats?.daily || [];
  const statusBreak = stats?.statusCounts || {};
  const methodBreak = useMemo(
    () => Object.fromEntries((stats?.paymentMethods || []).map((m) => [m.method, m.orders])),
    [stats]
  );
  const topProducts = useMemo(() => (stats?.topProducts || []).map((p) => [p.name, p]), [stats]);

  const exportCSV = () => {
    // Exports the REPORT (KPIs, daily revenue, status/method split, best
    // sellers) rather than raw order rows — those are on Orders → Export CSV,
    // and this page no longer loads every order into the browser.
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
      return `"${s.replace(/"/g, '""')}"`;
    };
    const fmt = (d) => new Date(d).toLocaleDateString();
    const rows = [
      ["Report", `${fmt(range.from)} to ${fmt(range.to)}`],
      [],
      ["Metric", "Value"],
      ["Orders", kpi.orders],
      ["Revenue (received, net of refunds)", kpi.revenue],
      ["Refunded", stats?.refunded || 0],
      ["Average order value", Math.round(kpi.avg)],
      ["COD still to collect", kpi.codPending],
      [],
      ["Date", "Revenue", "Orders"],
      ...(stats?.daily || []).map((d) => [d.date, d.revenue, d.orders]),
      [],
      ["Order status", "Orders"],
      ...Object.entries(statusBreak).map(([k, v]) => [k, v]),
      [],
      ["Payment method", "Orders"],
      ...Object.entries(methodBreak).map(([k, v]) => [k, v]),
      [],
      ["Best seller", "Units", "Revenue"],
      ...(stats?.topProducts || []).map((p) => [p.name, p.qty, p.revenue]),
    ];
    const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (status === "loading" || loading || permLoading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("reports")) {
    return (
      <PermissionGate
        perm="reports"
        what="reports"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="your reports" onRetry={() => { setLoadError(false); load(); }} />;
  }

  // A figure on its own says nothing — ৳50,000 is a triumph or a collapse
  // depending on the month before it. `change` is null when the previous
  // period had nothing to compare against, and then no arrow is drawn
  // rather than an invented "+100%".
  const cards = [
    { label: "Revenue", value: formatCurrency(kpi.revenue), sub: "received, net of refunds", change: stats?.change?.revenue },
    { label: "Total Orders", value: kpi.orders, sub: "in selected range", change: stats?.change?.orders },
    { label: "Avg Order Value", value: formatCurrency(Math.round(kpi.avg)), sub: "from paid orders", change: stats?.change?.avgOrder },
    { label: "Today's Orders", value: kpi.todayOrders, sub: formatCurrency(kpi.todayRevenue) + " paid" },
    { label: "Week's Revenue", value: formatCurrency(kpi.weekRevenue), sub: `${kpi.weekOrders} orders` },
    { label: "COD to collect", value: formatCurrency(kpi.codPending), sub: "excludes cancelled" },
  ];

  const buyers = stats?.buyers || { new: 0, returning: 0 };
  const totalBuyers = buyers.new + buyers.returning;

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 border border-accent text-accent hover:bg-accent hover:text-primary font-bold px-4 py-2 rounded-md text-sm transition-colors"
          >
            <Icon name="download" size={15} />
              Export CSV
          </button>
        </div>

        {/* range controls */}
        <div className="flex flex-wrap items-center gap-3 bg-primary-light border border-white/10 rounded-xl p-4">
          <FilterChips ariaLabel="Quick range" options={QUICK} value={quick} onChange={setQuick} />
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" className={inputCls} value={from} onChange={(e) => { setFrom(e.target.value); setQuick(""); }} />
            <span className="text-zinc-500 text-sm">→</span>
            <input type="date" className={inputCls} value={to} onChange={(e) => { setTo(e.target.value); setQuick(""); }} />
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-primary-light border border-white/10 rounded-xl p-4 hover:border-accent/60 transition-colors">
              <p className="text-[11px] uppercase tracking-wider text-zinc-400">{c.label}</p>
              <p className="text-xl font-extrabold text-white mt-1">{c.value}</p>
              <div className="flex items-center gap-1.5 mt-1">
                {typeof c.change === "number" && (
                  <span
                    className={`text-[11px] font-bold ${
                      c.change > 0 ? "text-green-400" : c.change < 0 ? "text-red-400" : "text-zinc-500"
                    }`}
                    title={`vs the previous ${Math.max(1, Math.round((range.to - range.from) / 864e5))} days`}
                  >
                    {c.change > 0 ? "↑" : c.change < 0 ? "↓" : "–"} {Math.abs(c.change)}%
                  </span>
                )}
                <p className="text-[11px] text-zinc-500">{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* revenue chart */}
        <section className="bg-primary-light border border-white/10 rounded-xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-1 h-5 bg-accent rounded-full" />
              Daily revenue
            </h2>
            <p className="text-[11px] text-zinc-500">
              Money received, net of refunds · days counted in {stats?.timezone || "the store's timezone"}
            </p>
          </div>
          <BarChart
            data={series}
            valueKey="revenue"
            labelKey="label"
            formatValue={(n) => formatCurrency(n)}
            // Orders ride in the tooltip rather than on a second y-axis:
            // two scales in one frame is how a chart invents a relationship.
            tooltipExtra={(d) => (
              <span className="block text-white/60">
                {d.orders} order{d.orders === 1 ? "" : "s"}
              </span>
            )}
            height={200}
            emptyMessage="No orders in this range."
          />
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* status breakdown */}
          <section className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Order Status</h2>
            {Object.entries(statusBreak).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span className="font-bold">{ORDER_STATUS_LABELS[k] || k}</span>
                  <span>{v}</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${statusColors[k] || "bg-zinc-400"}`}
                    style={{ width: `${(v / Math.max(kpi.orders, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(statusBreak).length === 0 && <p className="text-xs text-zinc-500">No data in range.</p>}
          </section>

          {/* payment method */}
          <section className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Payment Methods</h2>
            {Object.entries(methodBreak).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span className="font-bold uppercase">{k}</span>
                  <span>{v} orders</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${k === "cod" ? "bg-blue-400" : "bg-green-400"}`}
                    style={{ width: `${(v / Math.max(kpi.orders, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(methodBreak).length === 0 && <p className="text-xs text-zinc-500">No data in range.</p>}
          </section>

          {/* who's buying */}
          <section className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Customers</h2>
            {totalBuyers === 0 ? (
              <p className="text-xs text-zinc-500">Nobody ordered in this range.</p>
            ) : (
              <>
                {/* Counted from first-ever order date, so "returning" means
                    they had bought before this period — not a guess. */}
                {[
                  { label: "New customers", n: buyers.new, color: "bg-accent" },
                  { label: "Returning", n: buyers.returning, color: "bg-green-400" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span className="font-bold">{row.label}</span>
                      <span>
                        {row.n} ({Math.round((row.n / totalBuyers) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${(row.n / totalBuyers) * 100}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-zinc-500 pt-1">
                  {stats?.newCustomers ?? 0} account{stats?.newCustomers === 1 ? "" : "s"} opened · {stats?.customers ?? 0} in total
                </p>
                {stats?.refunded > 0 && (
                  <p className="text-[11px] text-red-400">{formatCurrency(stats.refunded)} refunded in this range</p>
                )}
              </>
            )}
          </section>

          {/* top products */}
          <section className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Top Products</h2>
            {topProducts.map(([name, d], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-accent/15 text-accent text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{name}</p>
                  <p className="text-[10px] text-zinc-500">{d.qty} sold • {formatCurrency(d.revenue)}</p>
                </div>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-xs text-zinc-500">No sales in range.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}