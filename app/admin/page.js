// app/admin/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();

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

  useEffect(() => {
    if (status === "authenticated" && can("dashboard")) {
      Promise.all([
        fetch("/api/orders").then((r) => r.json()),
        fetch("/api/products?limit=1000").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
      ])
        .then(([ordersRes, productsRes, usersRes]) => {
          const orders = ordersRes.success ? (Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data.orders || []) : [];
          const products = productsRes.success ? productsRes.data.products || [] : [];
          const users = usersRes.success ? usersRes.data || [] : [];

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const todayOrders = orders.filter((o) => new Date(o.createdAt) >= today);
          const todayRevenue = todayOrders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + (o.totalAmount || 0), 0);
          const pendingOrders = orders.filter((o) => o.orderStatus === "processing").length;
          const lowStock = products.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5)).length;

          setStats({
            todayOrders: todayOrders.length,
            todayRevenue,
            pendingOrders,
            totalCustomers: users.length,
            lowStock,
            totalProducts: products.length,
          });

          setRecentOrders(orders.slice(0, 5));

          // top products by quantity sold
          const productSales = {};
          orders.forEach((o) => {
            if (o.orderStatus === "cancelled") return;
            (o.items || []).forEach((item) => {
              const key = item.name;
              if (!productSales[key]) productSales[key] = { name: key, qty: 0, revenue: 0 };
              productSales[key].qty += item.quantity;
              productSales[key].revenue += item.quantity * (item.price || 0);
            });
          });
          setTopProducts(
            Object.values(productSales)
              .sort((a, b) => b.qty - a.qty)
              .slice(0, 5)
          );
        })
        .catch(() => {})
        .finally(() => setLoading(false));
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

  if (!session || !can("dashboard")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <p className="text-xl font-bold admin-text-primary">Access denied</p>
        <Link href="/" className="bg-accent hover:bg-accent/90 text-white font-bold px-6 py-3 rounded-lg transition-colors">
          Back to home
        </Link>
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Orders",
      value: stats.todayOrders,
      icon: "🛒",
      gradient: "from-blue-500 to-cyan-500",
      bgLight: "bg-blue-50",
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      icon: "💰",
      gradient: "from-emerald-500 to-teal-500",
      bgLight: "bg-emerald-50",
    },
    {
      label: "Pending Orders",
      value: stats.pendingOrders,
      icon: "⚡",
      gradient: "from-accent to-orange-500",
      bgLight: "bg-orange-50",
      link: "/admin/orders",
    },
    {
      label: "Total Customers",
      value: stats.totalCustomers,
      icon: "👥",
      gradient: "from-purple-500 to-pink-500",
      bgLight: "bg-purple-50",
      link: "/admin/customers",
    },
    {
      label: "Low Stock Products",
      value: stats.lowStock,
      icon: "⚠️",
      gradient: "from-amber-500 to-orange-500",
      bgLight: "bg-amber-50",
      link: "/admin/products",
    },
    {
      label: "Total Products",
      value: stats.totalProducts,
      icon: "📦",
      gradient: "from-indigo-500 to-purple-500",
      bgLight: "bg-indigo-50",
      link: "/admin/products",
    },
  ];

  const quickActions = [
    { label: "Add Product", href: "/admin/products/new", icon: "➕", color: "bg-emerald-500" },
    { label: "View Orders", href: "/admin/orders", icon: "📋", color: "bg-blue-500" },
    { label: "Categories", href: "/admin/categories", icon: "🗂️", color: "bg-purple-500" },
    { label: "Digital Products", href: "/admin/digital", icon: "💾", color: "bg-cyan-500" },
    { label: "Discounts", href: "/admin/discounts", icon: "🏷️", color: "bg-pink-500" },
    { label: "Reports", href: "/admin/reports", icon: "📊", color: "bg-indigo-500" },
  ];

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Welcome header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold admin-text-primary">
            Welcome back, <span className="text-accent">{session?.user?.name}!</span>
          </h1>
          <p className="text-sm admin-text-muted mt-1">Here's what's happening with your store today</p>
        </div>
        <div className="text-xs admin-text-muted">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Stats cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card, i) => (
          <Link
            key={i}
            href={card.link || "#"}
            className={`admin-card rounded-xl p-4 hover:shadow-lg transition-all hover:-translate-y-0.5 ${card.link ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className={`w-12 h-12 rounded-lg ${card.bgLight} flex items-center justify-center text-2xl mb-3`}>
              {card.icon}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider admin-text-muted mb-1">{card.label}</p>
            <p className="text-2xl font-extrabold admin-text-primary">{card.value}</p>
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
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-accent/40 transition-all hover:-translate-y-0.5"
            >
              <span className={`w-12 h-12 rounded-xl ${action.color} flex items-center justify-center text-2xl shadow-lg`}>
                {action.icon}
              </span>
              <span className="text-xs font-bold admin-text-primary text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 admin-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold admin-text-primary flex items-center gap-2">
              <span className="w-1 h-5 bg-accent rounded-full" />
              Recent Orders
            </h2>
            <Link href="/admin/orders" className="text-xs font-bold text-accent hover:underline">
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm admin-text-muted text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order._id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent to-orange-500 flex items-center justify-center text-white text-xs font-extrabold shrink-0">
                    {order.user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold admin-text-primary truncate">
                      {order.user?.name || "Unknown"}
                    </p>
                    <p className="text-[11px] admin-text-muted truncate">
                      {order.orderNumber} • {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-accent">{formatCurrency(order.totalAmount)}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        order.orderStatus === "delivered"
                          ? "bg-emerald-100 text-emerald-700"
                          : order.orderStatus === "cancelled"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-accent/10 text-accent"
                      }`}
                    >
                      {order.orderStatus}
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