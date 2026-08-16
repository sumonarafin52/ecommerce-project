// components/layout/AdminFooter.jsx
"use client";

import Link from "next/link";

export default function AdminFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="admin-footer admin-border border-t px-4 lg:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] admin-text-muted bg-white">
      <p>
        © {year} <span className="font-bold admin-text-primary">SumonMart</span> Admin • v1.0
      </p>
      <div className="flex items-center gap-4">
        <Link href="/admin/reports" className="hover:text-accent transition-colors">Reports</Link>
        <Link href="/admin/products" className="hover:text-accent transition-colors">Products</Link>
        <Link href="/admin/orders" className="hover:text-accent transition-colors">Orders</Link>
        <span className="flex items-center gap-1.5">
          <span className="relative flex w-1.5 h-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
          </span>
          All systems operational
        </span>
      </div>
    </footer>
  );
}