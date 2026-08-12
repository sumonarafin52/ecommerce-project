// components/layout/AdminTopHeader.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";

export default function AdminTopHeader() {
  const { data: session } = useSession();
  const { permissions } = usePermissions();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  useEffect(() => {
    if (!permissions.includes("products") && !permissions.includes("orders")) return;
    fetch("/api/products?limit=1000")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const list = res.data.products || [];
          const low = list.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5)).length;
          const out = list.filter((p) => p.stock <= 0).length;
          setLowStockCount(low + out);
        }
      })
      .catch(() => {});
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const list = Array.isArray(res.data) ? res.data : res.data.orders || [];
          setPendingOrderCount(list.filter((o) => o.orderStatus === "processing" && o.paymentStatus === "paid").length);
        }
      })
      .catch(() => {});
  }, [permissions]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    window.location.href = `/admin/products?q=${encodeURIComponent(search.trim())}`;
  };

  const initials = session?.user?.name
    ? session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "A";

  return (
    <header className="admin-header sticky top-0 z-30 h-16 px-4 lg:px-6 flex items-center gap-4">
      <div className="w-10 shrink-0" />

      <form onSubmit={onSearchSubmit} className="flex-1 max-w-xl">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 admin-text-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, orders, customers..."
            className="admin-input w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition-colors"
          />
          <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold admin-text-muted bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold admin-text-secondary hover:bg-gray-100 border admin-border transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Store
        </a>

        <div className="relative group">
          <button className="relative w-10 h-10 rounded-lg admin-border hover:bg-gray-100 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 admin-text-secondary" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {(lowStockCount + pendingOrderCount) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[9px] font-extrabold text-white flex items-center justify-center">
                {lowStockCount + pendingOrderCount}
              </span>
            )}
          </button>
          <div className="absolute right-0 top-full mt-2 w-80 bg-white admin-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-2">
            <p className="text-[10px] font-bold uppercase tracking-widest admin-text-muted px-3 py-2">Notifications</p>
            {pendingOrderCount > 0 && (
              <Link href="/admin/orders" className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-orange-500 text-white flex items-center justify-center shrink-0 text-xs font-extrabold">
                  ⚡
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold admin-text-primary">{pendingOrderCount} orders need attention</p>
                  <p className="text-[11px] admin-text-muted">Paid orders process korar jonno ready</p>
                </div>
              </Link>
            )}
            {lowStockCount > 0 && (
              <Link href="/admin/products" className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 text-xs font-extrabold">
                  ⚠
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold admin-text-primary">{lowStockCount} products low/out of stock</p>
                  <p className="text-[11px] admin-text-muted">Inventory check korun</p>
                </div>
              </Link>
            )}
            {pendingOrderCount + lowStockCount === 0 && (
              <p className="text-xs admin-text-muted text-center py-6">No new notifications ✓</p>
            )}
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu((s) => !s)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg admin-border hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent to-orange-500 flex items-center justify-center text-white text-[11px] font-extrabold shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold admin-text-primary leading-tight truncate max-w-[110px]">{session?.user?.name}</p>
              <p className="text-[10px] admin-text-muted leading-tight capitalize">{session?.user?.role?.replace("_", " ")}</p>
            </div>
            <svg className="w-3.5 h-3.5 admin-text-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-60 bg-white admin-border rounded-xl shadow-2xl z-20 p-2">
                <div className="px-3 py-2.5 admin-border mb-1">
                  <p className="text-sm font-bold admin-text-primary truncate">{session?.user?.name}</p>
                  <p className="text-[11px] admin-text-muted truncate">{session?.user?.email}</p>
                </div>
                <Link href="/profile" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm admin-text-secondary transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile
                </Link>
                <Link href="/" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm admin-text-secondary transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
                  </svg>
                  Back to Store
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-rose-50 text-sm text-rose-500 transition-colors mt-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}