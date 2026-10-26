// components/layout/AdminFooter.jsx
"use client";

import Link from "next/link";
import useStoreSettings from "@/lib/useStoreSettings";

export default function AdminFooter() {
  const storeName = useStoreSettings()?.general?.storeName || "";
  const year = new Date().getFullYear();
  return (
    <footer className="admin-footer admin-border border-t px-4 lg:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] admin-text-muted bg-white">
      <p>
        © {year} <span className="font-bold admin-text-primary">{storeName || "Store"}</span> Admin
      </p>
      <div className="flex items-center gap-4">
        <Link href="/admin/reports" className="hover:text-accent transition-colors">Reports</Link>
        <Link href="/admin/products" className="hover:text-accent transition-colors">Products</Link>
        <Link href="/admin/orders" className="hover:text-accent transition-colors">Orders</Link>
        {/* "All systems operational" was a fixed string — it reported
            nothing and stayed green during a real outage. The sidebar's
            store-status indicator reflects actual configuration instead. */}
      </div>
    </footer>
  );
}