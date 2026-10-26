// app/admin/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { storeReadiness } from "@/lib/adminChrome";
import Icon from "@/components/ui/Icon";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  const [loadError, setLoadError] = useState(false);

  const [stats, setStats] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    pendingOrders: 0,
    totalCustomers: 0,
    lowStock: 0,
    totalProducts: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  // Can the store actually take an order right now? Nothing used to answer
  // this, so a store with no usable payment method looked healthy here while
  // every checkout dead-ended.
  const [readiness, setReadiness] = useState(null);

  useEffect(() => {
    if (status === "authenticated" && can("dashboard")) {
      // One server-computed call. The old version fetched every order, product
      // and user into the browser and did the maths here — and /api/orders only
      // ever returns the latest 100 orders, so every figure silently went wrong
      // once the store passed 100 orders. Also counts "total customers" properly
      // (it used to count staff accounts too).
      setLoadError(false);
      fetch("/api/admin/stats", { cache: "no-store" })
        .then((r) => r.json())
        .then((res) => {
          // Returning quietly here is how the dashboard came to report ৳0
          // revenue and zero orders during an outage — a confident, specific,
          // wrong answer about the owner's own business.
          if (!res.success) return setLoadError(true);
          const d = res.data;
          setStats({
            todayOrders: d.todayOrders,
            todayRevenue: d.todayRevenue,
            // Already computed by the stats endpoint and never shown. A zero
            // on its own tells the owner nothing — whether it is a quiet
            // morning or a broken checkout only shows against the week.
            weekOrders: d.weekOrders,
            weekRevenue: d.weekRevenue,
            pendingOrders: (d.statusCounts.pending || 0) + (d.statusCounts.processing || 0),
            totalCustomers: d.customers,
            lowStock: d.products.lowStock,
            outOfStock: d.products.outOfStock,
            totalProducts: d.products.total,
          });
          setRecentOrders(d.recentOrders || []);
          setTopProducts(d.topProducts || []);
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));

      // shared with the sidebar, which also shows store readiness
      storeReadiness.get().then((d) => d && setReadiness(d));
    } else {
      setLoading(false);
    }
  }, [status, can]);

  if (status === "loading" || permLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("dashboard")) {
    return (
      <PermissionGate
        perm="dashboard"
        what="the dashboard"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="your dashboard" onRetry={() => { setLoadError(false); load(); }} />;
  }

  // Three groups, because these are three different kinds of number and
  // the owner does something different with each. Six identically weighted
  // cards in six different colours gave equal billing to "today's revenue"
  // and "total products", and spent colour on decoration — so nothing on
  // the page said what needed doing.
  const todayStats = [
    {
      label: "Orders today",
      value: stats.todayOrders,
      context: `${stats.weekOrders} in the last 7 days`,
      icon: "cart",
      link: "/admin/orders",
    },
    {
      label: "Revenue today",
      value: formatCurrency(stats.todayRevenue),
      context: `${formatCurrency(stats.weekRevenue)} in the last 7 days`,
      icon: "tag",
    },
  ];

  // Only these turn amber, and only when the number is above zero: colour
  // here means "this needs you", not "this is a card".
  const attentionStats = [
    { label: "Orders waiting", value: stats.pendingOrders, icon: "package", link: "/admin/orders" },
    { label: "Low stock", value: stats.lowStock, icon: "returns", link: "/admin/products?tab=low" },
    { label: "Out of stock", value: stats.outOfStock, icon: "shield", link: "/admin/products?tab=out" },
  ];

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const catalogueStats = [
    { label: plural(stats.totalCustomers, "customer", "customers"), link: "/admin/customers", value: stats.totalCustomers },
    { label: plural(stats.totalProducts, "product", "products"), link: "/admin/products", value: stats.totalProducts },
  ];

  const quickActions = [
    { label: "Add Product", href: "/admin/products/new", icon: "plus" },
    { label: "View Orders", href: "/admin/orders", icon: "list" },
    { label: "Categories", href: "/admin/categories", icon: "folder" },
    // a floppy disk for digital products was a puzzle, not a signpost
    { label: "Digital Products", href: "/admin/digital", icon: "download" },
    { label: "Discounts", href: "/admin/discounts", icon: "tag" },
    { label: "Reports", href: "/admin/reports", icon: "chart" },
  ];

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Welcome header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold admin-text-primary">
            Welcome back, <span className="text-accent">{session?.user?.name}!</span>
          </h1>
          <p className="text-sm admin-text-muted mt-1">Here&apos;s what&apos;s happening with your store today</p>
        </div>
        <div className="text-xs admin-text-muted">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Store readiness — only rendered when there's something real to
          report. A store that can sell sees nothing here. */}
      {readiness?.issues?.length > 0 && (
        <div
          className={`rounded-xl border p-4 ${
            readiness.canAcceptOrders
              ? "border-amber-300 bg-amber-50"
              : "border-rose-300 bg-rose-50"
          }`}
        >
          <div className="flex items-start gap-3">
            <Icon
              name={readiness.canAcceptOrders ? "warning" : "blocked"}
              size={20}
              className={`shrink-0 mt-0.5 ${readiness.canAcceptOrders ? "text-amber-700" : "text-rose-700"}`}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-extrabold ${readiness.canAcceptOrders ? "text-amber-900" : "text-rose-900"}`}>
                {readiness.canAcceptOrders
                  ? "Your store is taking orders, with some things to fix"
                  : "Your store cannot take orders right now"}
              </p>
              <ul className="mt-2.5 space-y-2">
                {readiness.issues.map((issue) => (
                  <li key={issue.id} className="rounded-lg border border-black/5 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                          issue.level === "blocker" ? "bg-rose-600 text-white" : "bg-amber-500 text-white"
                        }`}
                      >
                        {issue.level === "blocker" ? "Blocking" : "Warning"}
                      </span>
                      <span className="text-xs font-bold admin-text-primary">{issue.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed admin-text-muted">{issue.detail}</p>
                    {issue.action && (
                      <Link
                        href={issue.action.href}
                        className="mt-1.5 inline-block text-[11px] font-bold text-accent hover:underline"
                      >
                        {issue.action.label} →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Today, then what needs doing, then the size of the shop. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        <div className="grid grid-cols-2 gap-4">
          {todayStats.map((card) => (
            <Link
              key={card.label}
              href={card.link || "#"}
              className={`admin-card rounded-xl p-4 transition-shadow duration-ui ease-ui ${
                card.link ? "hover:shadow-e2" : "cursor-default"
              }`}
            >
              <div className="flex items-center gap-2 admin-text-muted">
                <Icon name={card.icon} size={16} />
                <p className="text-[12px] font-semibold">{card.label}</p>
              </div>
              <p className="text-[28px] font-extrabold admin-text-primary mt-2 leading-none tabular-nums">
                {card.value}
              </p>
              <p className="text-[11.5px] admin-text-muted mt-2 tabular-nums">{card.context}</p>
            </Link>
          ))}
        </div>

        <div className="admin-card rounded-xl p-4">
          <p className="text-[12px] font-semibold admin-text-muted mb-3">Needs your attention</p>
          <div className="grid grid-cols-3 divide-x divide-[#E3E3E3]">
            {attentionStats.map((card) => {
              const needsAction = Number(card.value) > 0;
              return (
                <Link
                  key={card.label}
                  href={card.link}
                  className="px-3 first:pl-0 last:pr-0 group"
                >
                  <div className={`flex items-center gap-1.5 ${needsAction ? "text-amber-700" : "admin-text-muted"}`}>
                    <Icon name={card.icon} size={15} />
                    <p className="text-[11.5px] font-semibold leading-tight">{card.label}</p>
                  </div>
                  <p
                    className={`text-[26px] font-extrabold mt-1.5 leading-none tabular-nums ${
                      needsAction ? "text-amber-700" : "admin-text-primary"
                    }`}
                  >
                    {card.value}
                  </p>
                  <p className="text-[11px] admin-text-muted mt-1.5 group-hover:underline">
                    {needsAction ? "Open" : "All clear"}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reference figures, deliberately quiet: they change slowly and are
          never the thing to act on first. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-[13px] admin-text-secondary">
        {catalogueStats.map((c) => (
          <Link key={c.label} href={c.link} className="hover:underline">
            <span className="font-bold admin-text-primary tabular-nums">{c.value}</span>{" "}
            {c.label.replace(`${c.value} `, "")}
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="admin-card rounded-xl p-6">
        <h2 className="text-base font-extrabold admin-text-primary mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-accent rounded-full" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action, i) => (
            <Link
              key={i}
              href={action.href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-[#E3E3E3] hover:border-[#B5B5B5] hover:bg-[#FAFAFA] transition-colors"
            >
              {/* quiet neutral tile — the six saturated gradients competed with
                  the real data on this page */}
              <span className="w-10 h-10 rounded-lg bg-[#F1F1F1] text-[#303030] flex items-center justify-center">
                <Icon name={action.icon} size={19} />
              </span>
              <span className="text-[12.5px] font-semibold text-[#303030] text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 admin-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold admin-text-primary flex items-center gap-2">
              <span className="w-1 h-5 bg-accent rounded-full" />
              Recent Orders
            </h2>
            <Link href="/admin/orders" className="text-xs font-bold text-accent hover:underline">
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm admin-text-muted text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order._id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-9 h-9 rounded-lg bg-[#E3E3E3] flex items-center justify-center text-[#616161] text-xs font-bold shrink-0">
                    {(order.shippingAddress?.fullName || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold admin-text-primary truncate">
                      {order.shippingAddress?.fullName || "Customer"}
                    </p>
                    <p className="text-[11px] admin-text-muted truncate">
                      {order.orderNumber} • {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-[#303030]">{formatCurrency(order.totalAmount)}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        order.orderStatus === "delivered"
                          ? "bg-emerald-100 text-emerald-700"
                          : order.orderStatus === "cancelled" || order.orderStatus === "on_hold"
                          ? "bg-rose-100 text-rose-700"
                          : order.orderStatus === "returned"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-accent/10 text-accent"
                      }`}
                    >
                      {ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="admin-card rounded-xl p-6">
          <h2 className="text-base font-extrabold admin-text-primary mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-full" />
            Top Selling Products
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-sm admin-text-muted text-center py-8">No sales yet</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-orange-500 flex items-center justify-center text-white text-xs font-extrabold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold admin-text-primary truncate">{p.name}</p>
                    <p className="text-[11px] admin-text-muted">{p.qty} sold</p>
                  </div>
                  <span className="text-xs font-extrabold text-accent">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}