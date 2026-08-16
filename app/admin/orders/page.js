// app/admin/orders/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/orderStatus";

// "pending" is a system-driven state (awaiting payment) — staff shouldn't
// bulk-assign it, so it's left out of the bulk-action list. The filter
// dropdown still offers every status so a "pending" order can be found.
const bulkStatusOptions = ORDER_STATUSES.filter((s) => s !== "pending");
const paymentOptions = ["pending", "paid", "failed", "refunded"];

const selectCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-accent transition-colors";
const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

const badge = (color) => `px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${color}`;

const payColors = {
  paid: "bg-green-500/15 text-green-400",
  pending: "bg-accent/15 text-accent",
  failed: "bg-red-500/15 text-red-400",
  refunded: "bg-zinc-500/15 text-zinc-400",
};

const TABS = [
  { key: "all", label: "All Orders" },
  { key: "open", label: "Open" },
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "on_hold", label: "On Hold" },
  { key: "unpaid", label: "Unpaid" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "refunded", label: "Refunded" },
];

const matchTab = (o, key) => {
  switch (key) {
    case "open":
      return o.paymentStatus === "pending" && !["cancelled", "returned"].includes(o.orderStatus);
    case "unfulfilled":
      return ["pending", "processing"].includes(o.orderStatus);
    case "on_hold":
      return o.orderStatus === "on_hold";
    case "unpaid":
      return o.paymentMethod === "cod" && o.paymentStatus === "pending" && o.orderStatus !== "cancelled";
    case "fulfilled":
      return ["delivered", "returned"].includes(o.orderStatus);
    case "refunded":
      return o.paymentStatus === "refunded";
    default:
      return true;
  }
};

export default function AdminOrdersPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    method: "all",
    orderStatus: "all",
    paymentStatus: "all",
    city: "",
    min: "",
    max: "",
    tracking: "",
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("shipped");
  const [updating, setUpdating] = useState(false);

  // Staff with the "orders" permission can view the list; bulk mutations
  // additionally require "orders_update" (enforced server-side too — this
  // is just for showing/hiding controls, not the actual security boundary).
  const canView = can("orders");
  const canUpdate = can("orders_update");
  const isAdmin = canView; // kept as the existing variable name used below

  const loadOrders = () => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setOrders(Array.isArray(res.data) ? res.data : res.data.orders || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && isAdmin) loadOrders();
    else setLoading(false);
  }, [status, isAdmin]);

  const counts = useMemo(() => {
    const c = {};
    TABS.forEach((t) => {
      c[t.key] = orders.filter((o) => matchTab(o, t.key)).length;
    });
    return c;
  }, [orders]);

  // ===== SMART SEARCH + FILTERS =====
  const visible = useMemo(() => {
    let list = orders.filter((o) => matchTab(o, tab));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o._id,
          o.orderNumber,
          o.user?.name,
          o.user?.email,
          o.shippingAddress?.fullName,
          o.shippingAddress?.phone,
          o.shippingAddress?.city,
          o.shippingAddress?.address,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (filters.from) list = list.filter((o) => new Date(o.createdAt) >= new Date(filters.from));
    if (filters.to) list = list.filter((o) => new Date(o.createdAt) <= new Date(filters.to + "T23:59:59"));
    if (filters.method !== "all") list = list.filter((o) => o.paymentMethod === filters.method);
    if (filters.orderStatus !== "all") list = list.filter((o) => o.orderStatus === filters.orderStatus);
    if (filters.paymentStatus !== "all") list = list.filter((o) => o.paymentStatus === filters.paymentStatus);
    if (filters.city)
      list = list.filter((o) =>
        (o.shippingAddress?.city || "").toLowerCase().includes(filters.city.toLowerCase())
      );
    if (filters.min) list = list.filter((o) => o.totalAmount >= Number(filters.min));
    if (filters.max) list = list.filter((o) => o.totalAmount <= Number(filters.max));
    if (filters.tracking) {
      const t = filters.tracking.trim().toLowerCase();
      list = list.filter((o) =>
        (o.shipment?.trackingNumber || "").toLowerCase().includes(t) ||
        (o.fulfillments || []).some((f) => (f.trackingNumber || "").toLowerCase().includes(t))
      );
    }

    return list;
  }, [orders, tab, search, filters]);

  const activeFilterCount = Object.values(filters).filter((v) => v && v !== "all").length;

  // ===== CSV EXPORT (client-side — exports whatever is currently filtered) =====
  const exportCSV = () => {
    const rows = visible.map((o) => ({
      "Order Number": `#${(o._id || "").slice(-6).toUpperCase()}`,
      "Date": formatDate(o.createdAt),
      "Customer": o.user?.name || "",
      "Email": o.user?.email || "",
      "Phone": o.shippingAddress?.phone || "",
      "City": o.shippingAddress?.city || "",
      "Items": (o.items || []).map((i) => `${i.name} x${i.quantity}`).join("; "),
      "Subtotal": o.baseAmount || o.items.reduce((s, i) => s + i.price * i.quantity, 0),
      "Discount": o.discountAmount || 0,
      "Shipping": o.shippingCost || 0,
      "Total": o.totalAmount,
      "Payment Method": o.paymentMethod,
      "Payment Status": o.paymentStatus,
      "Order Status": o.orderStatus,
      "Tracking": o.shipment?.trackingNumber || (o.fulfillments || []).map((f) => f.trackingNumber).filter(Boolean).join("; ") || "",
    }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== SELECTION =====
  const toggleAll = () => {
    setSelectedIds(selectedIds.length === visible.length ? [] : visible.map((o) => o._id));
  };
  const toggleOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const bulkUpdate = async () => {
    if (!selectedIds.length) return;
    setUpdating(true);
    await Promise.all(
      selectedIds.map((id) =>
        fetch(`/api/orders/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderStatus: bulkStatus }),
        }).then((r) => r.json())
      )
    );
    setSelectedIds([]);
    loadOrders();
    setUpdating(false);
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} order(s)? Stock will be restored for unshipped orders.`)) return;
    setUpdating(true);
    const results = await Promise.all(
      selectedIds.map((id) => fetch(`/api/orders/${id}`, { method: "DELETE" }).then((r) => r.json()))
    );
    const failed = results.filter((r) => !r.success);
    if (failed.length) {
      toast.error(
        failed.length === selectedIds.length
          ? "None were deleted — orders with payment history can't be deleted (cancel/refund them instead)."
          : `${selectedIds.length - failed.length} deleted, ${failed.length} skipped (payment history — cancel/refund instead).`
      );
    } else {
      toast.success(`${selectedIds.length} order(s) deleted`);
    }
    setSelectedIds([]);
    loadOrders();
    setUpdating(false);
  };

  if (status === "loading" || loading || permLoading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !isAdmin) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Admin access required</p>
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
            Orders
            <span className="bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 rounded-full">{orders.length}</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="border border-white/15 hover:border-accent hover:text-accent text-zinc-300 font-bold px-4 py-2.5 rounded-md text-sm transition-colors"
            >
              Export CSV
            </button>
            {canUpdate && (
              <Link
                href="/admin/orders/new"
                className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2.5 rounded-md text-sm transition-colors shadow-glow"
              >
                + Create Order
              </Link>
            )}
          </div>
        </div>

        {/* search + filter toggle */}
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order id, email, phone, name, city or address..."
            className="flex-1 bg-primary-light border border-white/15 rounded-md px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`px-4 py-2.5 rounded-md text-sm font-bold border transition-colors ${
              showFilters || activeFilterCount
                ? "border-accent text-accent bg-accent/10"
                : "border-white/15 text-zinc-300 hover:border-accent hover:text-accent"
            }`}
          >
            Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>

        {/* filter panel */}
        {showFilters && (
          <div className="bg-primary-light border border-white/10 rounded-xl p-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">From date</label>
              <input type="date" className={`${inputCls} w-full`} value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">To date</label>
              <input type="date" className={`${inputCls} w-full`} value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Payment method</label>
              <select className={`${selectCls} w-full`} value={filters.method} onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}>
                <option value="all" className="bg-primary">All</option>
                <option value="sslcommerz" className="bg-primary">SSLCommerz</option>
                <option value="cod" className="bg-primary">COD</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Order status</label>
              <select className={`${selectCls} w-full`} value={filters.orderStatus} onChange={(e) => setFilters((f) => ({ ...f, orderStatus: e.target.value }))}>
                <option value="all" className="bg-primary">All</option>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-primary">{ORDER_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Payment status</label>
              <select className={`${selectCls} w-full`} value={filters.paymentStatus} onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}>
                <option value="all" className="bg-primary">All</option>
                {paymentOptions.map((s) => (
                  <option key={s} value={s} className="bg-primary capitalize">{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">City</label>
              <input className={`${inputCls} w-full`} placeholder="e.g. Dhaka" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Tracking number</label>
              <input className={`${inputCls} w-full`} placeholder="Search tracking #" value={filters.tracking} onChange={(e) => setFilters((f) => ({ ...f, tracking: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Min total (৳)</label>
              <input type="number" className={`${inputCls} w-full`} value={filters.min} onChange={(e) => setFilters((f) => ({ ...f, min: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Max total (৳)</label>
              <input type="number" className={`${inputCls} w-full`} value={filters.max} onChange={(e) => setFilters((f) => ({ ...f, max: e.target.value }))} />
            </div>
            <div className="col-span-2 lg:col-span-6 text-right">
              <button
                onClick={() => setFilters({ from: "", to: "", method: "all", orderStatus: "all", paymentStatus: "all", city: "", min: "", max: "", tracking: "" })}
                className="text-xs text-zinc-400 hover:text-red-400 font-bold"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                tab === t.key ? "border-accent text-accent" : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-accent/15" : "bg-white/5"}`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {/* bulk actions bar */}
        {selectedIds.length > 0 && canUpdate && (
          <div className="flex flex-wrap items-center gap-3 bg-accent/10 border border-accent/40 rounded-xl px-4 py-3">
            <span className="text-sm font-bold text-accent">{selectedIds.length} selected</span>
            <select className={selectCls} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              {bulkStatusOptions.map((s) => (
                <option key={s} value={s} className="bg-primary">{ORDER_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button onClick={bulkUpdate} disabled={updating} className="bg-accent hover:bg-accent/80 text-primary text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
              Apply Status
            </button>
            <button onClick={bulkDelete} disabled={updating} className="border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
              Delete Selected
            </button>
            <button onClick={() => setSelectedIds([])} className="text-xs text-zinc-400 hover:text-white font-bold ml-auto">
              Clear selection
            </button>
          </div>
        )}

        {/* table */}
        {visible.length === 0 ? (
          <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">No orders found.</div>
        ) : (
          <div className="overflow-x-auto bg-primary-light border border-white/10 rounded-xl">
            <table className="w-full text-sm text-left min-w-[820px]">
              <thead>
                <tr className="text-zinc-400 border-b border-white/10">
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={visible.length > 0 && selectedIds.length === visible.length}
                      onChange={toggleAll}
                      className="accent-[#f5a623] w-4 h-4"
                    />
                  </th>
                  <th className="p-4 font-medium">Order</th>
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Customer</th>
                  <th className="p-4 font-medium">Payment</th>
                  <th className="p-4 font-medium">Fulfillment</th>
                  <th className="p-4 font-medium">Total</th>
                  <th className="p-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o._id} className={`border-b border-white/5 transition-colors ${selectedIds.includes(o._id) ? "bg-accent/5" : "hover:bg-white/5"}`}>
                    <td className="p-4">
                      <input type="checkbox" checked={selectedIds.includes(o._id)} onChange={() => toggleOne(o._id)} className="accent-[#f5a623] w-4 h-4" />
                    </td>
                    <td className="p-4">
                      <Link href={`/admin/orders/${o._id}`} className="font-bold text-white hover:text-accent hover:underline">
                        #{(o._id || "").slice(-6).toUpperCase()}
                      </Link>
                      {o.paymentMethod === "cod" && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">COD</span>
                      )}
                    </td>
                    <td className="p-4 text-zinc-400">{formatDate(o.createdAt)}</td>
                    <td className="p-4 text-zinc-300">
                      {o.user?.name || "Unknown"}
                      <p className="text-xs text-zinc-500">{o.shippingAddress?.city}</p>
                    </td>
                    <td className="p-4"><span className={badge(payColors[o.paymentStatus])}>{o.paymentStatus}</span></td>
                    <td className="p-4"><span className={badge(ORDER_STATUS_COLORS[o.orderStatus])}>{ORDER_STATUS_LABELS[o.orderStatus] || o.orderStatus}</span></td>
                    <td className="p-4 font-bold text-accent">{formatCurrency(o.totalAmount)}</td>
                    <td className="p-4 text-right">
                      <Link href={`/admin/orders/${o._id}`} className="text-accent hover:underline font-bold text-xs">
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}