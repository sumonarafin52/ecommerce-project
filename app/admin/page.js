// app/admin/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0, pending: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated" || session.user?.role !== "admin") {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch("/api/products?limit=1").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ])
      .then(([prodRes, orderRes]) => {
        if (prodRes.success) setStats((s) => ({ ...s, products: prodRes.data.total }));
        if (orderRes.success) {
          const orders = orderRes.data;
          setStats((s) => ({
            ...s,
            orders: orders.length,
            revenue: orders
              .filter((o) => o.paymentStatus === "paid")
              .reduce((sum, o) => sum + o.totalAmount, 0),
            pending: orders.filter((o) => o.orderStatus === "processing").length,
          }));
          setRecent(orders.slice(0, 5));
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
    { label: "Total Products", value: stats.products },
    { label: "Total Orders", value: stats.orders },
    { label: "Revenue (paid)", value: formatCurrency(stats.revenue) },
    { label: "Pending Orders", value: stats.pending },
  ];

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <div className="flex gap-3">
            <Link
              href="/admin/products"
              className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2 rounded-md text-sm transition-colors"
            >
              Manage Products
            </Link>
            <Link
              href="/admin/orders"
              className="border border-accent text-accent hover:bg-accent hover:text-primary font-bold px-4 py-2 rounded-md text-sm transition-colors"
            >
              Manage Orders
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-primary-light border border-white/10 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wider text-zinc-400">{c.label}</p>
              <p className="text-2xl font-extrabold text-accent mt-2">{c.value}</p>
            </div>
          ))}
        </div>

        <section className="bg-primary-light border border-white/10 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-full" />
            Recent Orders
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-zinc-400">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-zinc-400 border-b border-white/10">
                    <th className="py-2 pr-4 font-medium">Orders</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 font-medium">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o._id} className="border-b border-white/5 text-zinc-200">
                      <td className="py-2.5 pr-4 font-bold">#{o._id.slice(-6).toUpperCase()}</td>
                      <td className="py-2.5 pr-4">{o.user?.name || "Customer"}</td>
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