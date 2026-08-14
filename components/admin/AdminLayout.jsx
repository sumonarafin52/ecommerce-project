// components/admin/AdminLayout.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
  chevron: "M15 19l-7-7 7-7",
  down: "M19 9l-7 7-7-7",
  external: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // generic open/close state for any sidebar group with children
  // (Products, Settings, and any future grouped nav item)
  const [openGroups, setOpenGroups] = useState({});
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
    {
      key: "settings",
      label: "Settings",
      icon: icons.settings,
      perm: "settings",
      children: [
        { href: "/admin/settings/general", label: "General" },
        { href: "/admin/settings/payment", label: "Payment Methods" },
        { href: "/admin/settings/billing", label: "Billing" },
        { href: "/admin/settings/shipping", label: "Shipping" },
      ],
    },
  ].filter((item) => can(item.perm));

  // a group is "active" when the current path matches its own href or any child href
  const isGroupActive = (item) =>
    item.children?.some((c) => pathname.startsWith(c.href)) || false;

  useEffect(() => {
    const activeGroup = nav.find((item) => item.children && isGroupActive(item));
    if (activeGroup) setOpenGroups((g) => ({ ...g, [activeGroup.key]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const sidebar = (
    <>
      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-5">
        {!collapsed && (
          <div className="rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-3 py-2.5 flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
            </span>
            <p className="text-xs font-bold text-emerald-700">Store is live</p>
          </div>
        )}

        <div>
          {!collapsed && <p className="px-2 text-[10px] font-bold uppercase tracking-widest admin-text-muted mb-2">Management</p>}
          {permLoading ? (
            <div className="space-y-2 px-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded-md bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {nav.map((item) =>
                item.children ? (
                  <div key={item.key}>
                    {collapsed ? (
                      <Link
                        href={item.children[0].href}
                        onClick={() => setOpen(false)}
                        title={item.label}
                        className={`relative flex items-center justify-center rounded-lg px-0 py-2.5 text-sm font-bold transition-all ${
                          isGroupActive(item) ? "bg-accent/10 text-accent" : "admin-text-secondary hover:bg-gray-100"
                        }`}
                      >
                        <Icon d={item.icon} />
                      </Link>
                    ) : (
                      <>
                        <button
                          onClick={() => setOpenGroups((g) => ({ ...g, [item.key]: !g[item.key] }))}
                          className={`relative w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                            isGroupActive(item) ? "bg-accent/10 text-accent" : "admin-text-secondary hover:bg-gray-100"
                          }`}
                        >
                          {isGroupActive(item) && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full" />}
                          <Icon d={item.icon} />
                          <span className="flex-1 text-left">{item.label}</span>
                          <Icon d={icons.down} className={`w-4 h-4 transition-transform ${openGroups[item.key] ? "rotate-180" : ""}`} />
                        </button>
                        {openGroups[item.key] && (
                          <div className="ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-3">
                            {item.children.map((c) => (
                              <Link
                                key={c.href}
                                href={c.href}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-bold transition-colors ${
                                  isActive(c.href) ? "text-accent bg-accent/10" : "admin-text-secondary hover:bg-gray-50"
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
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                      isActive(item.href) ? "bg-accent/10 text-accent" : "admin-text-secondary hover:bg-gray-100"
                    } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
                  >
                    {isActive(item.href) && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full" />}
                    <Icon d={item.icon} />
                    {!collapsed && <span className="flex-1">{item.label}</span>}
                    {!collapsed && item.badge > 0 && (
                      <span className="text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5">{item.badge}</span>
                    )}
                  </Link>
                )
              )}
              {!permLoading && nav.length === 0 && (
                <p className="px-2 text-xs admin-text-muted">No admin access for your role.</p>
              )}
            </div>
          )}
        </div>

        {!collapsed && pendingCount > 0 && can("orders") && (
          <Link
            href="/admin/orders"
            onClick={() => setOpen(false)}
            className="block rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 border border-accent/30 p-3 hover:border-accent/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Icon d={icons.bolt} className="w-4 h-4 text-accent" />
              <p className="text-xs font-bold text-accent">{pendingCount} orders need attention</p>
            </div>
            <p className="text-[11px] admin-text-muted mt-1">Unfulfilled orders pore ache</p>
          </Link>
        )}

        <div>
          {!collapsed && <p className="px-2 text-[10px] font-bold uppercase tracking-widest admin-text-muted mb-2">Sales Channels</p>}
          <Link
            href="/"
            title="Online Store"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold admin-text-secondary hover:bg-gray-100 transition-all ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
          >
            <Icon d={icons.store} />
            {!collapsed && <span className="flex-1">Online Store</span>}
            {!collapsed && <Icon d={icons.external} className="w-4 h-4" />}
          </Link>
        </div>
      </div>

      {/* collapse toggle at bottom */}
      <div className="border-t border-gray-200 p-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 admin-text-secondary hover:bg-gray-100 hover:text-accent text-xs font-bold py-2 transition-colors"
        >
          <Icon d={icons.chevron} className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </>
  );

  return (
    <div>
      <aside
        className={`admin-sidebar hidden lg:flex fixed left-0 top-16 bottom-0 z-40 flex-col transition-all duration-300 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {sidebar}
      </aside>

      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-accent to-orange-500 text-white shadow-2xl flex items-center justify-center"
        aria-label="Open admin menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="admin-sidebar absolute inset-y-0 left-0 w-72 border-r border-gray-200 flex flex-col">{sidebar}</aside>
        </div>
      )}

      <main className={`transition-all duration-300 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>{children}</main>
    </div>
  );
}