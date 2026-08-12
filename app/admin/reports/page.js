// app/admin/reports/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";

const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-accent transition-colors";

const QUICK = [
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

const statusColors = {
  processing: "bg-accent",
  shipped: "bg-blue-400",
  delivered: "bg-green-400",
  cancelled: "bg-red-400",
};

export default function AdminReportsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (status === "authenticated" && can("reports")) {
      fetch("/api/orders")
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setOrders(Array.isArray(res.data) ? res.data : res.data.orders || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [status, can]);

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

  const filtered = useMemo(
    () => orders.filter((o) => new Date(o.createdAt) >= range.from && new Date(o.createdAt) <= range.to),
    [orders, range]
  );

  const kpi = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(now.getTime() - 6 * 864e5);

    const paid = filtered.filter((o) => o.paymentStatus === "paid");
    const revenue = paid.reduce((s, o) => s + (o.totalAmount || 0), 0);

    const todayOrders = filtered.filter((o) => new Date(o.createdAt) >= today);
    const weekOrders = filtered.filter((o) => new Date(o.createdAt) >= week);

    return {
      orders: filtered.length,
      revenue,
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0),
      weekOrders: weekOrders.length,
      weekRevenue: weekOrders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0),
      avg: paid.length ? revenue / paid.length : 0,
      codPending: filtered
        .filter((o) => o.paymentMethod === "cod" && o.paymentStatus === "pending")
        .reduce((s, o) => s + o.totalAmount, 0),
    };
  }, [filtered]);

  // daily revenue series (max 31 bars)
  const series = useMemo(() => {
    const days = [];
    const end = new Date(range.to);
    const start = new Date(range.from);
    const span = Math.min(31, Math.max(1, Math.round((end - start) / 864e5) + 1));
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, total: 0 });
    }
    filtered.forEach((o) => {
      if (o.paymentStatus !== "paid") return;
      const d = new Date(o.createdAt);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      const slot = days.find((x) => x.label === key);
      if (slot) slot.total += o.totalAmount;
    });
    return days;
  }, [filtered, range]);

  const maxDay = Math.max(...series.map((s) => s.total), 1);

  const statusBreak = useMemo(() => {
    const m = {};
    filtered.forEach((o) => {
      m[o.orderStatus] = (m[o.orderStatus] || 0) + 1;
    });
    return m;
  }, [filtered]);

  const methodBreak = useMemo(() => {
    const m = {};
    filtered.forEach((o) => {
      m[o.paymentMethod] = (m[o.paymentMethod] || 0) + 1;
    });
    return m;
  }, [filtered]);

  const topProducts = useMemo(() => {
    const m = {};
    filtered.forEach((o) => {
      if (o.orderStatus === "cancelled") return;
      (o.items || []).forEach((it) => {
        if (!m[it.name]) m[it.name] = { qty: 0, revenue: 0 };
        m[it.name].qty += it.quantity;
        m[it.name].revenue += it.quantity * (it.price || 0);
      });
    });
    return Object.entries(m)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5);
  }, [filtered]);

  const exportCSV = () => {
    const rows = [
      ["Order ID", "Date", "Customer", "City", "Method", "Payment", "Status", "Total"],
      ...filtered.map((o) => [
        o._id,
        new Date(o.createdAt).toLocaleString(),
        o.user?.name || "Unknown",
        o.shippingAddress?.city || "",
        o.paymentMethod,
        o.paymentStatus,
        o.orderStatus,
        o.totalAmount,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
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

  if (!session || !can("reports")) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access denied</p>
        <Link href="/" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to home
        </Link>
      </div>
    );
  }

  const cards = [
    { label: "Total Orders", value: kpi.orders, sub: "in selected range" },
    { label: "Revenue (paid)", value: formatCurrency(kpi.revenue), sub: "in selected range" },
    { label: "Today's Orders", value: kpi.todayOrders, sub: formatCurrency(kpi.todayRevenue) + " paid" },
    { label: "Week's Revenue", value: formatCurrency(kpi.weekRevenue), sub: `${kpi.weekOrders} orders` },
    { label: "Avg Order Value", value: formatCurrency(Math.round(kpi.avg)), sub: "from paid orders" },
    { label: "COD Pending", value: formatCurrency(kpi.codPending), sub: "to collect on delivery" },
  ];

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <button
            onClick={exportCSV}
            className="border border-accent text-accent hover:bg-accent hover:text-primary font-bold px-4 py-2 rounded-md text-sm transition-colors"
          >
            ⬇ Export CSV
          </button>
        </div>

        {/* range controls */}
        <div className="flex flex-wrap items-center gap-3 bg-primary-light border border-white/10 rounded-xl p-4">
          <div className="flex gap-2">
            {QUICK.map((q) => (
              <button
                key={q.key}
                onClick={() => setQuick(q.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  quick === q.key ? "border-accent bg-accent/15 text-accent" : "border-white/15 text-zinc-400 hover:text-white"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
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
              <p className="text-[11px] text-zinc-500 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* revenue bar chart */}
        <section className="bg-primary-light border border-white/10 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-full" />
            Daily Revenue (paid)
          </h2>
          <div className="flex items-end gap-1 h-44">
            {series.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${s.label}: ${formatCurrency(s.total)}`}>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-accent/60 to-accent group-hover:from-orange-600 group-hover:to-orange-400 transition-all"
                  style={{ height: `${Math.max(2, (s.total / maxDay) * 160)}px` }}
                />
                {series.length <= 16 && <span className="text-[9px] text-zinc-500">{s.label}</span>}
              </div>
            ))}
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* status breakdown */}
          <section className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Order Status</h2>
            {Object.entries(statusBreak).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span className="capitalize font-bold">{k}</span>
                  <span>{v}</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${statusColors[k] || "bg-zinc-400"}`}
                    style={{ width: `${(v / Math.max(filtered.length, 1)) * 100}%` }}
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
                    style={{ width: `${(v / Math.max(filtered.length, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(methodBreak).length === 0 && <p className="text-xs text-zinc-500">No data in range.</p>}
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