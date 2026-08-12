// components/admin/AdminLayout.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";

const Icon = ({ d, className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const icons = {
  home: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10",
  orders: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  products: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  customers: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  reports: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  discounts: "M7 7h.01M7 3h5a2 2 0 011.4.6l7 7a2 2 0 010 2.8l-5 5a2 2 0 01-2.8 0l-7-7A2 2 0 015 10V5a2 2 0 012-2z",
  category: "M4 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z",
  digital: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  store: "M3 9l1.5-5h15L21 9M4 9v11h16V9M9 20v-6h6v6M3 9h18",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  chevron: "M15 19l-7-7 7-7",
  down: "M19 9l-7 7-7-7",
  external: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
};

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [orderCount, setOrderCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (session?.user?.role === "customer") return;
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const list = Array.isArray(res.data) ? res.data : res.data.orders || [];
          setOrderCount(list.length);
          setPendingCount(list.filter((o) => o.orderStatus === "processing").length);
        }
      })
      .catch(() => {});
  }, [session, pathname]);

  // products submenu auto-open
  useEffect(() => {
    if (
      pathname.startsWith("/admin/products") ||
      pathname.startsWith("/admin/categories") ||
      pathname.startsWith("/admin/digital")
    ) {
      setProdOpen(true);
    }
  }, [pathname]);

  const isActive = (href) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const nav = [
    { href: "/admin", label: "Home", icon: icons.home, perm: "dashboard" },
    { href: "/admin/orders", label: "Orders", icon: icons.orders, perm: "orders", badge: orderCount },
    {
      key: "products",
      label: "Products",
      icon: icons.products,
      perm: "products",
      children: [
        { href: "/admin/products", label: "All Products" },
        { href: "/admin/categories", label: "Categories", icon: icons.category },
        { href: "/admin/digital", label: "Digital Products", icon: icons.digital },
      ],
    },
    { href: "/admin/customers", label: "Customers", icon: icons.customers, perm: "customers" },
    { href: "/admin/reports", label: "Reports", icon: icons.reports, perm: "reports" },
    { href: "/admin/discounts", label: "Discounts", icon: icons.discounts, perm: "discounts" },
  ].filter((item) => can(item.perm));

  const productsActive =
    pathname.startsWith("/admin/products") ||
    pathname.startsWith("/admin/categories") ||
    pathname.startsWith("/admin/digital");

  const sidebar = (
    <>
      {/* brand */}
      <div className={`flex items-center gap-3 px-4 h-16 border-b border-white/10 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center shadow-glow shrink-0">
          <span className="text-primary font-extrabold text-lg">S</span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-white leading-none">
              sumon<span className="text-accent">mart</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">Admin Panel</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-accent hover:border-accent transition-colors"
          aria-label="Toggle sidebar"
        >
          <Icon d={icons.chevron} className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
        <button onClick={() => setOpen(false)} className="lg:hidden text-zinc-400 hover:text-white text-xl" aria-label="Close menu">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-5">
        {!collapsed && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2.5 flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-green-400" />
            </span>
            <p className="text-xs font-bold text-green-400">Store is live</p>
          </div>
        )}

        {/* nav */}
        <div>
          {!collapsed && <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Management</p>}
          {permLoading ? (
            <div className="space-y-2 px-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded-md bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {nav.map((item) =>
                item.children ? (
                  <div key={item.key}>
                    {collapsed ? (
                      <Link
                        href="/admin/products"
                        onClick={() => setOpen(false)}
                        title={item.label}
                        className={`relative flex items-center justify-center rounded-md px-0 py-2.5 text-sm font-bold transition-all ${
                          productsActive ? "bg-accent/15 text-accent" : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Icon d={item.icon} />
                      </Link>
                    ) : (
                      <>
                        <button
                          onClick={() => setProdOpen((s) => !s)}
                          className={`relative w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold transition-all ${
                            productsActive ? "bg-accent/15 text-accent" : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          {productsActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full" />}
                          <Icon d={item.icon} />
                          <span className="flex-1 text-left">{item.label}</span>
                          <Icon d={icons.down} className={`w-4 h-4 transition-transform ${prodOpen ? "rotate-180" : ""}`} />
                        </button>
                        {prodOpen && (
                          <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                            {item.children.map((c) => (
                              <Link
                                key={c.href}
                                href={c.href}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-bold transition-colors ${
                                  isActive(c.href) ? "text-accent bg-accent/10" : "text-zinc-400 hover:text-white"
                                }`}
                              >
                                {c.icon && <Icon d={c.icon} className="w-3.5 h-3.5" />}
                                {c.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    title={item.label}
                    className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold transition-all hover:translate-x-1 ${
                      isActive(item.href) ? "bg-accent/15 text-accent" : "text-zinc-400 hover:text-white"
                    } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
                  >
                    {isActive(item.href) && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full" />}
                    <Icon d={item.icon} />
                    {!collapsed && <span className="flex-1">{item.label}</span>}
                    {!collapsed && item.badge > 0 && (
                      <span className="text-[10px] font-bold bg-accent text-primary rounded-full px-1.5 py-0.5">{item.badge}</span>
                    )}
                  </Link>
                )
              )}
              {!permLoading && nav.length === 0 && (
                <p className="px-2 text-xs text-zinc-500">No admin access for your role.</p>
              )}
            </div>
          )}
        </div>

        {/* attention card */}
        {!collapsed && pendingCount > 0 && can("orders") && (
          <Link
            href="/admin/orders"
            onClick={() => setOpen(false)}
            className="block rounded-lg border border-accent/30 bg-gradient-to-br from-accent/20 to-transparent p-3 hover:border-accent transition-colors"
          >
            <div className="flex items-center gap-2">
              <Icon d={icons.bolt} className="w-4 h-4 text-accent" />
              <p className="text-xs font-bold text-accent">{pendingCount} orders need attention</p>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Unfulfilled orders pore ache — ekhon e process korun</p>
          </Link>
        )}

        {/* sales channel */}
        <div>
          {!collapsed && <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Sales Channels</p>}
          <Link
            href="/"
            title="Online Store"
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold text-zinc-400 hover:text-white transition-all hover:translate-x-1 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
          >
            <Icon d={icons.store} />
            {!collapsed && <span className="flex-1">Online Store</span>}
            {!collapsed && <Icon d={icons.external} className="w-4 h-4" />}
          </Link>
        </div>
      </div>

      {/* footer admin card */}
      <div className={`border-t border-white/10 p-3 ${collapsed ? "lg:p-2" : ""}`}>
        {!collapsed ? (
          <div className="rounded-lg bg-black/20 border border-white/5 p-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent font-extrabold shrink-0">
                {session?.user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{session?.user?.name}</p>
                <p className="text-[11px] text-zinc-500 truncate capitalize">{session?.user?.role?.replace("_", " ")}</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold py-2 transition-colors"
            >
              <Icon d={icons.logout} className="w-4 h-4" />
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="hidden lg:flex w-full items-center justify-center rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 py-2 transition-colors"
            title="Logout"
          >
            <Icon d={icons.logout} className="w-4 h-4" />
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="bg-primary min-h-screen">
      {/* desktop sidebar */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col bg-primary-light border-r border-white/10 transition-all duration-300 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {sidebar}
      </aside>

      {/* mobile floating menu button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full bg-accent text-primary shadow-glow flex items-center justify-center"
        aria-label="Open admin menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-primary-light border-r border-white/10 flex flex-col">{sidebar}</aside>
        </div>
      )}

      {/* main content */}
      <main className={`transition-all duration-300 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>{children}</main>
    </div>
  );
}