// app/admin/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0, pending: 0, outOfStock: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated" || session.user?.role !== "admin") {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch("/api/products?limit=100").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ])
      .then(([prodRes, orderRes]) => {
        if (prodRes.success) {
          const products = prodRes.data.products || [];
          setStats((s) => ({
            ...s,
            products: prodRes.data.total ?? products.length,
            outOfStock: products.filter((p) => p.stock <= 0).length,
          }));
        }
        if (orderRes.success) {
          const orders = Array.isArray(orderRes.data) ? orderRes.data : orderRes.data.orders || [];
          setStats((s) => ({
            ...s,
            orders: orders.length,
            revenue: orders
              .filter((o) => o.paymentStatus === "paid")
              .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            pending: orders.filter((o) => o.orderStatus === "processing").length,
          }));
          setRecent(orders.slice(0, 6));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, session]);

  if (status === "loading" || loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || session.user?.role !== "admin") {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Admin access required</p>
        <p className="text-sm text-zinc-400">This area is restricted to administrators only.</p>
        <Link
          href="/"
          className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Products",
      value: stats.products,
      sub: `${stats.outOfStock} out of stock`,
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
      label: "Total Orders",
      value: stats.orders,
      sub: `${stats.pending} processing`,
      icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
    },
    {
      label: "Revenue (paid)",
      value: formatCurrency(stats.revenue),
      sub: "from paid orders",
      icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      label: "Pending Orders",
      value: stats.pending,
      sub: "need your attention",
      icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  ];

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-accent font-bold uppercase tracking-widest">Admin Panel</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
              Welcome back, {session.user?.name?.split(" ")[0]} 👋
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Here's what's happening in your store today.</p>
          </div>
          <Link
            href="/admin/products"
            className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2.5 rounded-md text-sm transition-colors shadow-glow"
          >
            + Add New Product
          </Link>
        </div>

        {/* stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="bg-primary-light border border-white/10 rounded-xl p-5 hover:border-accent/60 hover:shadow-glow transition-all"
            >
              <div className="w-11 h-11 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
                </svg>
              </div>
              <p className="text-2xl font-extrabold text-white mt-4">{c.value}</p>
              <p className="text-xs uppercase tracking-wider text-zinc-400 mt-1">{c.label}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* quick actions */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Link
            href="/admin/products"
            className="group bg-gradient-to-br from-accent/20 to-transparent border border-accent/30 rounded-xl p-5 hover:border-accent transition-colors"
          >
            <p className="font-bold text-white group-hover:text-accent transition-colors">Manage Products</p>
            <p className="text-xs text-zinc-400 mt-1">Add, edit, delete products & upload images</p>
          </Link>
          <Link
            href="/admin/orders"
            className="group bg-gradient-to-br from-accent/20 to-transparent border border-accent/30 rounded-xl p-5 hover:border-accent transition-colors"
          >
            <p className="font-bold text-white group-hover:text-accent transition-colors">Manage Orders</p>
            <p className="text-xs text-zinc-400 mt-1">Update order status & track payments</p>
          </Link>
        </div>

        {/* recent orders */}
        <section className="bg-primary-light border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-1 h-5 bg-accent rounded-full" />
              Recent Orders
            </h2>
            <Link href="/admin/orders" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[600px]">
                <thead>
                  <tr className="text-zinc-400 border-b border-white/10">
                    <th className="py-2 pr-4 font-medium">Order</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 font-medium">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 pr-4 font-bold text-white">#{(o._id || "").slice(-6).toUpperCase()}</td>
                      <td className="py-2.5 pr-4 text-zinc-300">{o.user?.name || "Customer"}</td>
                      <td className="py-2.5 pr-4 text-zinc-400">{formatDate(o.createdAt)}</td>
                      <td className="py-2.5 pr-4 font-bold text-accent">{formatCurrency(o.totalAmount)}</td>
                      <td className="py-2.5 capitalize">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            o.paymentStatus === "paid"
                              ? "bg-green-500/15 text-green-400"
                              : o.paymentStatus === "failed"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-accent/15 text-accent"
                          }`}
                        >
                          {o.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}