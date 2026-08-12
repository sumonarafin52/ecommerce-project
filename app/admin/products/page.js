// app/admin/products/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";

const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

const statusColors = {
  public: "bg-green-500/15 text-green-400",
  unlisted: "bg-zinc-500/15 text-zinc-400",
  draft: "bg-blue-500/15 text-blue-400",
  private: "bg-red-500/15 text-red-400",
};

const QUICK = [
  { key: "all", label: "All" },
  { key: "low", label: "Low Stock" },
  { key: "out", label: "Out of Stock" },
  { key: "draft", label: "Drafts" },
  { key: "featured", label: "Featured" },
];

const CSV_HEADERS = [
  "name", "category", "subcategory", "brand", "sku", "price", "discountPrice",
  "stock", "lowStockThreshold", "status", "tags", "images", "shortDescription", "description",
];

const parseCSV = (text) => {
  const rows = [];
  let cur = [], val = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; } else inQ = false;
      } else val += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { cur.push(val); val = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(val); val = "";
      if (cur.some((c) => c !== "")) rows.push(cur);
      cur = [];
    } else val += ch;
  }
  cur.push(val);
  if (cur.some((c) => c !== "")) rows.push(cur);
  return rows;
};

const emptyFilters = {
  category: "", brand: "", status: "", stock: "", minPrice: "", maxPrice: "",
  featured: "", noImages: "", hasVariants: "", dateFrom: "", dateTo: "",
};

export default function AdminProductsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState("newest");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("public");
  const [busy, setBusy] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", page);
    p.set("limit", 20);
    p.set("sort", sort);
    if (q) p.set("q", q);
    if (quick === "low") p.set("stock", "low");
    if (quick === "out") p.set("stock", "out");
    if (quick === "draft") p.set("status", "draft");
    if (quick === "featured") p.set("featured", "1");
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    return p.toString();
  }, [page, sort, q, quick, filters]);

  useEffect(() => {
    if (!(status === "authenticated" && can("products"))) return;
    setLoading(true);
    fetch(`/api/products?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setProducts(res.data.products);
          setTotal(res.data.total);
          setTotalPages(res.data.totalPages);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params, status, can]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const toggleAll = () =>
    setSelectedIds(selectedIds.length === products.length ? [] : products.map((p) => p._id));
  const toggleOne = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const bulk = async (action, value) => {
    if (!selectedIds.length) return;
    if (action === "delete" && !window.confirm(`Delete ${selectedIds.length} product(s)? This cannot be undone.`)) return;
    setBusy(true);
    await fetch("/api/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids: selectedIds, value }),
    }).then((r) => r.json());
    setSelectedIds([]);
    fetch(`/api/products?${params}`).then((r) => r.json()).then((res) => {
      if (res.success) { setProducts(res.data.products); setTotal(res.data.total); setTotalPages(res.data.totalPages); }
    });
    setBusy(false);
  };

  const singleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" }).then((r) => r.json());
    setSelectedIds([]);
    fetch(`/api/products?${params}`).then((r) => r.json()).then((res) => {
      if (res.success) { setProducts(res.data.products); setTotal(res.data.total); setTotalPages(res.data.totalPages); }
    });
  };

  const exportCSV = (list) => {
    const rows = [
      CSV_HEADERS,
      ...list.map((p) => CSV_HEADERS.map((h) => {
        if (h === "tags") return (p.tags || []).join("|");
        if (h === "images") return (p.images || []).join("|");
        return p[h] ?? "";
      })),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const runImport = async (file) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const headers = rows[0].map((h) => h.trim());
      const data = rows.slice(1).map((r) => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
        return obj;
      });
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: data }),
      }).then((r) => r.json());
      setImportResult(res.success ? res.data : { created: 0, failed: 0, errors: [{ row: 0, message: res.message }] });
      if (res.success) {
        fetch(`/api/products?${params}`).then((r) => r.json()).then((x) => {
          if (x.success) { setProducts(x.data.products); setTotal(x.data.total); setTotalPages(x.data.totalPages); }
        });
      }
    } catch {
      setImportResult({ created: 0, failed: 0, errors: [{ row: 0, message: "Failed to parse file" }] });
    }
    setImporting(false);
  };

  if (status === "loading" || permLoading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !can("products")) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access denied</p>
        <Link href="/" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Products
            <span className="bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 rounded-full">{total}</span>
          </h1>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setImportOpen(true); setImportResult(null); }} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent font-bold px-4 py-2.5 rounded-md text-sm transition-colors">
               Import CSV
            </button>
            <button onClick={() => exportCSV(products)} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent font-bold px-4 py-2.5 rounded-md text-sm transition-colors">
              ⬇ Export
            </button>
            <Link href="/admin/products/new" className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2.5 rounded-md text-sm transition-colors shadow-glow">
              + Add Product
            </Link>
          </div>
        </div>

        {/* search + sort + filter toggle */}
        <div className="flex flex-wrap gap-3">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, SKU, brand, category, tags..."
            className="flex-1 min-w-[220px] bg-primary-light border border-white/15 rounded-md px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors"
          />
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className={inputCls}>
            <option value="newest" className="bg-primary">Newest first</option>
            <option value="oldest" className="bg-primary">Oldest first</option>
            <option value="price_asc" className="bg-primary">Price: low → high</option>
            <option value="price_desc" className="bg-primary">Price: high → low</option>
            <option value="name" className="bg-primary">Name A–Z</option>
            <option value="updated" className="bg-primary">Recently updated</option>
            <option value="rating" className="bg-primary">Top rated</option>
          </select>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`px-4 py-2.5 rounded-md text-sm font-bold border transition-colors ${
              showFilters || activeFilterCount ? "border-accent text-accent bg-accent/10" : "border-white/15 text-zinc-300 hover:border-accent hover:text-accent"
            }`}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>

        {/* filter panel */}
        {showFilters && (
          <div className="bg-primary-light border border-white/10 rounded-xl p-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <input className={`${inputCls} w-full`} placeholder="Category" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} />
            <input className={`${inputCls} w-full`} placeholder="Brand" value={filters.brand} onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))} />
            <select className={`${inputCls} w-full`} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="" className="bg-primary">Any status</option>
              <option value="public" className="bg-primary">Public</option>
              <option value="unlisted" className="bg-primary">Unlisted</option>
              <option value="draft" className="bg-primary">Draft</option>
              <option value="private" className="bg-primary">Private</option>
            </select>
            <select className={`${inputCls} w-full`} value={filters.stock} onChange={(e) => setFilters((f) => ({ ...f, stock: e.target.value }))}>
              <option value="" className="bg-primary">Any stock</option>
              <option value="in" className="bg-primary">In stock</option>
              <option value="low" className="bg-primary">Low stock</option>
              <option value="out" className="bg-primary">Out of stock</option>
            </select>
            <input type="number" className={`${inputCls} w-full`} placeholder="Min price" value={filters.minPrice} onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))} />
            <input type="number" className={`${inputCls} w-full`} placeholder="Max price" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))} />
            <input type="date" className={`${inputCls} w-full`} value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" className={`${inputCls} w-full`} value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            <label className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <input type="checkbox" checked={filters.featured === "1"} onChange={(e) => setFilters((f) => ({ ...f, featured: e.target.checked ? "1" : "" }))} className="accent-[#f5a623] w-4 h-4" />
              Featured only
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <input type="checkbox" checked={filters.hasVariants === "1"} onChange={(e) => setFilters((f) => ({ ...f, hasVariants: e.target.checked ? "1" : "" }))} className="accent-[#f5a623] w-4 h-4" />
              Has variants
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <input type="checkbox" checked={filters.noImages === "1"} onChange={(e) => setFilters((f) => ({ ...f, noImages: e.target.checked ? "1" : "" }))} className="accent-[#f5a623] w-4 h-4" />
              Missing images
            </label>
            <div className="col-span-2 lg:col-span-2 text-right">
              <button onClick={() => setFilters(emptyFilters)} className="text-xs text-zinc-400 hover:text-red-400 font-bold">
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {/* quick tabs */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-white/10">
          {QUICK.map((t) => (
            <button
              key={t.key}
              onClick={() => { setQuick(t.key); setPage(1); }}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                quick === t.key ? "border-accent text-accent" : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* bulk bar */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 bg-accent/10 border border-accent/40 rounded-xl px-4 py-3">
            <span className="text-sm font-bold text-accent">{selectedIds.length} selected</span>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={inputCls}>
              <option value="public" className="bg-primary">public</option>
              <option value="unlisted" className="bg-primary">unlisted</option>
              <option value="draft" className="bg-primary">draft</option>
              <option value="private" className="bg-primary">private</option>
            </select>
            <button onClick={() => bulk("setStatus", bulkStatus)} disabled={busy} className="bg-accent hover:bg-accent/80 text-primary text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
              Set Status
            </button>
            <button onClick={() => { const c = window.prompt("New category name:"); if (c?.trim()) bulk("setCategory", c.trim()); }} disabled={busy} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
              Set Category
            </button>
            <button onClick={() => bulk("duplicate")} disabled={busy} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
              Duplicate
            </button>
            <button onClick={() => exportCSV(products.filter((p) => selectedIds.includes(p._id)))} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent text-xs font-bold px-3 py-2 rounded-md">
              Export Selected
            </button>
            <button onClick={() => bulk("delete")} disabled={busy} className="border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
              Delete
            </button>
            <button onClick={() => setSelectedIds([])} className="text-xs text-zinc-400 hover:text-white font-bold ml-auto">
              Clear
            </button>
          </div>
        )}

        {/* table */}
        {loading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">No products found.</div>
        ) : (
          <div className="overflow-x-auto bg-primary-light border border-white/10 rounded-xl">
            <table className="w-full text-sm text-left min-w-[860px]">
              <thead>
                <tr className="text-zinc-400 border-b border-white/10">
                  <th className="p-4 w-10">
                    <input type="checkbox" checked={products.length > 0 && selectedIds.length === products.length} onChange={toggleAll} className="accent-[#f5a623] w-4 h-4" />
                  </th>
                  <th className="p-4 font-medium">Product</th>
                  <th className="p-4 font-medium">SKU</th>
                  <th className="p-4 font-medium">Category</th>
                  <th className="p-4 font-medium">Price</th>
                  <th className="p-4 font-medium">Stock</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Updated</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id} className={`border-b border-white/5 transition-colors ${selectedIds.includes(p._id) ? "bg-accent/5" : "hover:bg-white/5"}`}>
                    <td className="p-4">
                      <input type="checkbox" checked={selectedIds.includes(p._id)} onChange={() => toggleOne(p._id)} className="accent-[#f5a623] w-4 h-4" />
                    </td>
                    <td className="p-4">
                      <Link href={`/admin/products/${p._id}/edit`} className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-md bg-black/20 border border-white/10 overflow-hidden shrink-0">
                          {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-contain" /> : <span className="text-zinc-600 text-[9px] flex items-center justify-center h-full">No img</span>}
                        </div>
                        <div>
                          <p className="font-bold text-white group-hover:text-accent transition-colors line-clamp-1">{p.name}</p>
                          <p className="text-[11px] text-zinc-500">{p.brand || "No brand"}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="p-4 text-zinc-400 text-xs">{p.sku || "—"}</td>
                    <td className="p-4 text-zinc-300">{p.category}</td>
                    <td className="p-4">
                      <p className="font-bold text-accent">{formatCurrency(p.discountPrice || p.price)}</p>
                      {p.discountPrice > 0 && <p className="text-[11px] text-zinc-500 line-through">{formatCurrency(p.price)}</p>}
                    </td>
                    <td className="p-4">
                      {p.stock <= 0 ? (
                        <span className="text-[11px] font-bold bg-red-500/15 text-red-400 px-2 py-1 rounded-full">Out of stock</span>
                      ) : p.stock <= (p.lowStockThreshold ?? 5) ? (
                        <span className="text-[11px] font-bold bg-accent/15 text-accent px-2 py-1 rounded-full">Low: {p.stock}</span>
                      ) : (
                        <span className="text-[11px] font-bold bg-green-500/15 text-green-400 px-2 py-1 rounded-full">{p.stock}</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${statusColors[p.status] || statusColors.public}`}>{p.status}</span>
                    </td>
                    <td className="p-4 text-zinc-400 text-xs">{formatDate(p.updatedAt)}</td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <Link href={`/admin/products/${p._id}/edit`} className="text-zinc-300 hover:text-accent font-bold text-xs border border-white/15 hover:border-accent rounded-md px-3 py-1.5 mr-2 inline-block transition-colors">
                        Edit
                      </Link>
                      <button onClick={() => singleDelete(p._id)} className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-md px-3 py-1.5 transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent font-bold px-4 py-2 rounded-md text-sm disabled:opacity-40 transition-colors">
              ← Prev
            </button>
            <span className="text-sm text-zinc-400 font-bold">Page {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border border-white/15 text-zinc-300 hover:border-accent hover:text-accent font-bold px-4 py-2 rounded-md text-sm disabled:opacity-40 transition-colors">
              Next →
            </button>
          </div>
        )}
      </div>

      {/* import modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-primary-light border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Import Products (CSV)</h2>
              <button onClick={() => setImportOpen(false)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">✕</button>
            </div>

            <a href="/api/products/import" className="inline-block text-xs text-accent hover:underline font-bold">
              ⬇ Download CSV template
            </a>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-white/15 hover:border-accent/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <p className="text-sm font-bold text-zinc-300">{importing ? "Importing..." : "Click to choose CSV file"}</p>
              <p className="text-xs text-zinc-500 mt-1">Max 500 rows • duplicates will be skipped</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) runImport(e.target.files[0]); e.target.value = ""; }}
              />
            </div>

            {importResult && (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <span className="text-xs font-bold bg-green-500/15 text-green-400 px-3 py-1.5 rounded-md">✓ {importResult.created} imported</span>
                  <span className="text-xs font-bold bg-red-500/15 text-red-400 px-3 py-1.5 rounded-md">✕ {importResult.failed} failed</span>
                </div>
                {importResult.errors?.length > 0 && (
                  <div className="max-h-40 overflow-y-auto no-scrollbar bg-black/20 rounded-md p-3 space-y-1 border border-white/5">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-400">Row {e.row}: {e.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}