// components/admin/CommandPalette.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency } from "@/lib/utils";
import Icon from "@/components/ui/Icon";

const PAGES = [
  { label: "Orders", href: "/admin/orders", perm: "orders", icon: "receipt" },
  { label: "Products", href: "/admin/products", perm: "products", icon: "package" },
  { label: "Add product", href: "/admin/products/new", perm: "products", icon: "plus" },
  { label: "Returns", href: "/admin/returns", perm: "orders", icon: "returns" },
  { label: "Support", href: "/admin/support", perm: "customers", icon: "chat" },
  { label: "Customers", href: "/admin/customers", perm: "customers", icon: "users" },
  { label: "Reports", href: "/admin/reports", perm: "reports", icon: "chart" },
  { label: "Discounts", href: "/admin/discounts", perm: "discounts", icon: "tag" },
  { label: "Settings", href: "/admin/settings", perm: "settings", icon: "gear" },
];

export default function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const { can } = usePermissions();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // flat list so arrow keys can move across section boundaries
  const items = useMemo(() => {
    if (!q.trim()) return PAGES.filter((p) => can(p.perm)).map((p) => ({ ...p, kind: "page" }));
    if (!results) return [];
    return [
      ...results.orders.map((o) => ({
        kind: "order",
        label: o.orderNumber,
        sub: `${o.shippingAddress?.fullName || "Customer"} · ${formatCurrency(o.totalAmount)} · ${o.orderStatus}`,
        href: `/admin/orders/${o._id}`,
        icon: "receipt",
      })),
      ...results.products.map((p) => ({
        kind: "product",
        label: p.name,
        sub: `${p.sku ? p.sku + " · " : ""}${formatCurrency(p.price)} · ${p.stock > 0 ? `${p.stock} in stock` : "out of stock"}`,
        href: `/admin/products/${p._id}/edit`,
        icon: "package",
      })),
      ...results.customers.map((c) => ({
        kind: "customer",
        label: c.name,
        sub: c.email,
        href: `/admin/customers?q=${encodeURIComponent(c.email)}`,
        icon: "user",
      })),
    ];
  }, [q, results, can]);

  const go = useCallback(
    (item) => {
      if (!item) return;
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  // debounced search — one request per pause in typing, not per keystroke
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => r.json())
        .then((res) => res.success && setResults(res.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open]);

  useEffect(() => setActive(0), [q, results]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(null);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  };

  // keep the highlighted row in view when moving with the keyboard
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#1A1A1A]/50 flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search admin"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-xl bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden animate-fade-up"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-[#E3E3E3]">
          <svg className="w-4 h-4 text-[#8A8A8A] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search orders, products, customers…"
            className="flex-1 h-12 text-[14px] text-[#303030] outline-none bg-transparent placeholder:text-[#8A8A8A]"
          />
          {loading && <span className="text-[11px] text-[#8A8A8A]">…</span>}
          <kbd className="text-[10px] font-semibold text-[#8A8A8A] border border-[#E3E3E3] rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#8A8A8A]">
              {q.trim().length < 2 ? "Type at least 2 characters" : loading ? "Searching…" : `No matches for “${q.trim()}”`}
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.kind + item.href + i}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === active ? "bg-[#F1F1F1]" : ""
                }`}
              >
                <Icon name={item.icon} size={16} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-[#303030] truncate">{item.label}</span>
                  {item.sub && <span className="block text-[12px] text-[#616161] truncate">{item.sub}</span>}
                </span>
                {i === active && <span className="text-[11px] text-[#8A8A8A] shrink-0">↵</span>}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-[#E3E3E3] bg-[#FAFAFA] text-[11px] text-[#8A8A8A] flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
