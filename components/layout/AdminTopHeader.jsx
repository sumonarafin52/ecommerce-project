// components/layout/AdminTopHeader.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";
import useStoreSettings from "@/lib/useStoreSettings";
import CommandPalette from "@/components/admin/CommandPalette";
import { orderCounts } from "@/lib/adminChrome";

export default function AdminTopHeader() {
  const storeName = useStoreSettings()?.general?.storeName || "";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");

  useEffect(() => {
    // show the right key for the platform instead of always "⌘K"
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcutLabel("⌘K");
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: session } = useSession();
  const { permissions } = usePermissions();
  const [showUserMenu, setShowUserMenu] = useState(false);
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
    // A count from the server rather than downloading the newest 100 orders
    // and filtering them here — which was both slow on every admin page and
    // wrong past 100 orders.
    orderCounts.get().then((d) => d && setPendingOrderCount(d.awaitingFulfilment));
  }, [permissions]);


  const initials = session?.user?.name
    ? session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "A";

  return (
    <header className="admin-header sticky top-0 z-40 h-14 px-3 lg:px-4 flex items-center gap-3 lg:gap-4">
      {/* ===== LOGO ===== */}
      <Link href="/admin" className="flex items-center gap-2.5 shrink-0 group">
        <div className="w-8 h-8 rounded-lg bg-[#2C5282] flex items-center justify-center">
          <span className="text-[#C98A2B] font-bold text-[15px] font-display">{(storeName || "S").charAt(0).toUpperCase()}</span>
        </div>
        {/* the store's real name (was hardcoded "SumonMart / Admin Panel") */}
        <p className="hidden md:block text-[14px] font-semibold text-[#E3E3E3] leading-none max-w-[160px] truncate">{storeName || "Admin"}</p>
      </Link>

      <div className="hidden lg:block w-px h-6 bg-[#4A4A4A]" />

      {/* ===== SEARCH — opens the command palette (⌘K) ===== */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex-1 min-w-0 max-w-xl flex items-center gap-2 rounded-lg h-9 px-3 bg-[#303030] border border-[#4A4A4A] text-left hover:bg-[#3A3A3A] transition-colors"
      >
        <svg className="w-4 h-4 text-[#B5B5B5] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-[13px] text-[#9A9A9A] truncate">Search orders, products, customers…</span>
        <kbd className="hidden sm:block text-[10px] font-semibold text-[#B5B5B5] border border-[#5A5A5A] px-1.5 py-0.5 rounded shrink-0">
          {shortcutLabel}
        </kbd>
      </button>

      {/* ===== RIGHT ACTIONS ===== */}
      <div className="flex items-center gap-2 ml-auto">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold text-[#E3E3E3] hover:bg-[#303030] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Store
        </a>

        {/* notifications */}
        <div className="relative group">
          <button className="relative w-9 h-9 rounded-lg hover:bg-[#303030] flex items-center justify-center transition-colors" aria-label="Notifications">
            <svg className="w-5 h-5 text-[#E3E3E3]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {lowStockCount + pendingOrderCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] h-[18px] admin-on-dark rounded-full bg-gradient-to-br from-rose-600 to-red-700 text-[9px] font-extrabold text-white flex items-center justify-center shadow-lg">
                {lowStockCount + pendingOrderCount}
              </span>
            )}
          </button>
          <div className="absolute right-0 top-full mt-2 w-80 bg-white admin-border rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-2">
            <p className="text-[10px] font-bold uppercase tracking-widest admin-text-muted px-3 py-2">Notifications</p>
            {pendingOrderCount > 0 && (
              <Link href="/admin/orders" className="flex items-start gap-3 p-3 rounded-xl hover:bg-orange-50 transition-colors">
                <span className="w-9 h-9 admin-on-dark rounded-xl bg-gradient-to-br from-accent to-orange-500 text-white flex items-center justify-center shrink-0 text-sm shadow-lg">⚡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold admin-text-primary">
                    {pendingOrderCount} order{pendingOrderCount === 1 ? "" : "s"} need{pendingOrderCount === 1 ? "s" : ""} attention
                  </p>
                  <p className="text-[11px] admin-text-muted">Ready to be processed and shipped</p>
                </div>
              </Link>
            )}
            {lowStockCount > 0 && (
              <Link href="/admin/products" className="flex items-start gap-3 p-3 rounded-xl hover:bg-amber-50 transition-colors">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 text-sm shadow-lg">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold admin-text-primary">{lowStockCount} products low/out of stock</p>
                  <p className="text-[11px] admin-text-muted">Check inventory levels</p>
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
            className="flex items-center gap-2 pl-1 pr-2 h-9 rounded-lg hover:bg-[#303030] transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-[#36C3A6] flex items-center justify-center text-[#0B3B32] text-[11px] font-bold shrink-0">
              {initials}
            </div>
            <p className="hidden sm:block text-[13px] font-semibold text-[#E3E3E3] truncate max-w-[120px]">{session?.user?.name}</p>
            <svg className="w-3.5 h-3.5 text-[#B5B5B5]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 bg-white admin-border rounded-2xl shadow-2xl z-20 p-2">
                <div className="px-3 py-3 border-b border-gray-100 mb-1 flex items-center gap-3">
                  <div className="w-10 h-10 admin-on-dark rounded-xl bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white text-sm font-extrabold shadow-lg">
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


      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}