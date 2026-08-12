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
    <header className="admin-header sticky top-0 z-40 h-16 px-4 lg:px-6 flex items-center gap-3 lg:gap-5">
      {/* ===== LOGO ===== */}
      <Link href="/admin" className="flex items-center gap-2.5 shrink-0 group">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
          <span className="text-white font-extrabold text-lg">S</span>
        </div>
        <div className="hidden md:block">
          <p className="font-extrabold admin-text-primary leading-none">
            Sumon<span className="text-accent">Mart</span>
          </p>
          <p className="text-[9px] uppercase tracking-widest admin-text-muted mt-0.5">Admin Panel</p>
        </div>
      </Link>

      <div className="hidden lg:block w-px h-8 bg-gray-200" />

      {/* ===== SEARCH ===== */}
      <form onSubmit={onSearchSubmit} className="flex-1 max-w-xl">
        <div className="relative group">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 admin-text-muted group-focus-within:text-accent transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, orders, customers..."
            className="admin-input w-full rounded-xl pl-10 pr-12 py-2.5 text-sm outline-none transition-all focus:shadow-lg focus:shadow-accent/10"
          />
          <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold admin-text-muted bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">
            ⌘K
          </kbd>
        </div>
      </form>

      {/* ===== RIGHT ACTIONS ===== */}
      <div className="flex items-center gap-2 ml-auto">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold admin-text-secondary hover:text-accent hover:bg-accent/10 border admin-border transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Store
        </a>

        {/* notifications */}
        <div className="relative group">
          <button className="relative w-10 h-10 rounded-xl admin-border hover:bg-gray-100 flex items-center justify-center transition-colors">
            <svg className="w-4.5 h-4.5 w-5 h-5 admin-text-secondary" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {lowStockCount + pendingOrderCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] h-[18px] rounded-full bg-gradient-to-br from-rose-500 to-red-500 text-[9px] font-extrabold text-white flex items-center justify-center shadow-lg">
                {lowStockCount + pendingOrderCount}
              </span>
            )}
          </button>
          <div className="absolute right-0 top-full mt-2 w-80 bg-white admin-border rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-2">
            <p className="text-[10px] font-bold uppercase tracking-widest admin-text-muted px-3 py-2">Notifications</p>
            {pendingOrderCount > 0 && (
              <Link href="/admin/orders" className="flex items-start gap-3 p-3 rounded-xl hover:bg-orange-50 transition-colors">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-orange-500 text-white flex items-center justify-center shrink-0 text-sm shadow-lg">⚡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold admin-text-primary">{pendingOrderCount} orders need attention</p>
                  <p className="text-[11px] admin-text-muted">Paid orders process korar jonno ready</p>
                </div>
              </Link>
            )}
            {lowStockCount > 0 && (
              <Link href="/admin/products" className="flex items-start gap-3 p-3 rounded-xl hover:bg-amber-50 transition-colors">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 text-sm shadow-lg">⚠</span>
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

        {/* user menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu((s) => !s)}
            className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1.5 rounded-xl admin-border hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white text-xs font-extrabold shadow-lg shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-extrabold admin-text-primary leading-tight truncate max-w-[110px]">{session?.user?.name}</p>
              <p className="text-[10px] admin-text-muted leading-tight capitalize">{session?.user?.role?.replace("_", " ")}</p>
            </div>
            <svg className="w-3.5 h-3.5 admin-text-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 bg-white admin-border rounded-2xl shadow-2xl z-20 p-2">
                <div className="px-3 py-3 border-b border-gray-100 mb-1 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white text-sm font-extrabold shadow-lg">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold admin-text-primary truncate">{session?.user?.name}</p>
                    <p className="text-[11px] admin-text-muted truncate">{session?.user?.email}</p>
                  </div>
                </div>
                <Link href="/profile" className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-sm admin-text-secondary transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile
                </Link>
                <Link href="/" className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-sm admin-text-secondary transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
                  </svg>
                  Back to Store
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-rose-50 text-sm text-rose-500 font-bold transition-colors mt-1"
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

      {/* gradient accent line */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-accent via-orange-400 to-accent opacity-60" />
    </header>
  );
}