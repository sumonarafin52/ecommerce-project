// app/admin/orders/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate, getEffectivePrice } from "@/lib/utils";

const statusOptions = ["processing", "shipped", "delivered", "cancelled"];
const paymentOptions = ["pending", "paid", "failed", "refunded"];

const selectCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-accent transition-colors";
const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

const badge = (color) => `px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${color}`;

const SHIPMENT_STATUSES = ["confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned"];

function ShipmentPanel({ orderId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shipment, setShipment] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [methods, setMethods] = useState([]);
  const [eventStatus, setEventStatus] = useState("shipped");
  const [eventNote, setEventNote] = useState("");
  const [eventLocation, setEventLocation] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/orders/${orderId}/shipment`).then((r) => r.json()),
      fetch("/api/shipping/carriers").then((r) => r.json()),
      fetch("/api/shipping/methods").then((r) => r.json()),
    ]).then(([s, c, m]) => {
      if (s.success) setShipment(s.data.shipment);
      if (c.success) setCarriers(c.data);
      if (m.success) setMethods(m.data);
    }).finally(() => setLoading(false));
  };
  useEffect(load, [orderId]);

  const saveFields = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier: shipment.carrier?._id || shipment.carrier || "",
          method: shipment.method?._id || shipment.method || "",
          trackingNumber: shipment.trackingNumber || "",
          estimatedDelivery: shipment.estimatedDelivery || "",
          notes: shipment.notes || "",
        }),
      }).then((r) => r.json());
      if (res.success) setShipment(res.data.shipment);
    } finally {
      setSaving(false);
    }
  };

  const addEvent = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addEvent: { status: eventStatus, note: eventNote, location: eventLocation } }),
      }).then((r) => r.json());
      if (res.success) {
        setShipment(res.data.shipment);
        setEventNote("");
        setEventLocation("");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !shipment) {
    return <p className="text-xs text-zinc-500">Loading shipment...</p>;
  }

  const carrierId = shipment.carrier?._id || shipment.carrier || "";
  const methodId = shipment.method?._id || shipment.method || "";
  const trackUrl = shipment.carrier?.trackingUrlTemplate && shipment.trackingNumber
    ? shipment.carrier.trackingUrlTemplate.replace("{tracking_number}", shipment.trackingNumber)
    : null;

  return (
    <div className="space-y-3 bg-black/20 rounded-md p-3 border border-white/5">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Shipping</p>

      <div className="grid grid-cols-2 gap-2">
        <select className={selectCls} value={carrierId} onChange={(e) => setShipment({ ...shipment, carrier: e.target.value })}>
          <option value="" className="bg-primary">No carrier</option>
          {carriers.map((c) => <option key={c._id} value={c._id} className="bg-primary">{c.name}</option>)}
        </select>
        <select className={selectCls} value={methodId} onChange={(e) => setShipment({ ...shipment, method: e.target.value })}>
          <option value="" className="bg-primary">No method</option>
          {methods.map((m) => <option key={m._id} value={m._id} className="bg-primary">{m.name}</option>)}
        </select>
        <input
          className={inputCls}
          placeholder="Tracking number"
          value={shipment.trackingNumber || ""}
          onChange={(e) => setShipment({ ...shipment, trackingNumber: e.target.value })}
        />
        <input
          type="date"
          className={inputCls}
          value={shipment.estimatedDelivery ? String(shipment.estimatedDelivery).slice(0, 10) : ""}
          onChange={(e) => setShipment({ ...shipment, estimatedDelivery: e.target.value })}
        />
      </div>
      {trackUrl && (
        <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline font-bold">
          Track on carrier site ↗
        </a>
      )}
      <button type="button" onClick={saveFields} disabled={saving} className="text-xs font-bold text-accent hover:underline disabled:opacity-50">
        {saving ? "Saving..." : "Save shipping details"}
      </button>

      {shipment.timeline?.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          {shipment.timeline.slice().reverse().map((ev, i) => (
            <div key={i} className="text-xs text-zinc-300 flex gap-2">
              <span className="font-bold capitalize text-white shrink-0">{ev.status.replace(/_/g, " ")}</span>
              <span className="text-zinc-500">{formatDate(ev.at)}{ev.location ? ` · ${ev.location}` : ""}</span>
              {ev.note && <span className="text-zinc-400">— {ev.note}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-white/10 space-y-2">
        <p className="text-[11px] font-bold text-zinc-500 uppercase">Add tracking update</p>
        <div className="grid grid-cols-2 gap-2">
          <select className={selectCls} value={eventStatus} onChange={(e) => setEventStatus(e.target.value)}>
            {SHIPMENT_STATUSES.map((s) => <option key={s} value={s} className="bg-primary capitalize">{s.replace(/_/g, " ")}</option>)}
          </select>
          <input className={inputCls} placeholder="Location (optional)" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} />
        </div>
        <input className={`${inputCls} w-full`} placeholder="Note (optional)" value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
        <button
          type="button"
          onClick={addEvent}
          disabled={saving}
          className="bg-accent/20 hover:bg-accent/30 text-accent text-xs font-bold px-3 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          + Add Update
        </button>
      </div>
    </div>
  );
}

const payColors = {
  paid: "bg-green-500/15 text-green-400",
  pending: "bg-accent/15 text-accent",
  failed: "bg-red-500/15 text-red-400",
  refunded: "bg-zinc-500/15 text-zinc-400",
};

const orderColors = {
  processing: "bg-accent/15 text-accent",
  shipped: "bg-blue-500/15 text-blue-400",
  delivered: "bg-green-500/15 text-green-400",
  cancelled: "bg-red-500/15 text-red-400",
};

const TABS = [
  { key: "all", label: "All Orders" },
  { key: "open", label: "Open" },
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "unpaid", label: "Unpaid" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "refunded", label: "Refunded" },
];

const matchTab = (o, key) => {
  switch (key) {
    case "open":
      return o.paymentStatus === "pending" && o.orderStatus !== "cancelled";
    case "unfulfilled":
      return o.orderStatus === "processing";
    case "unpaid":
      return o.paymentMethod === "cod" && o.paymentStatus === "pending" && o.orderStatus !== "cancelled";
    case "fulfilled":
      return o.orderStatus === "delivered";
    case "refunded":
      return o.paymentStatus === "refunded";
    default:
      return true;
  }
};

const emptyCreate = {
  userId: "",
  items: [{ product: "", quantity: 1 }],
  fullName: "",
  phone: "",
  address: "",
  city: "",
  paymentMethod: "cod",
  paymentStatus: "pending",
};

export default function AdminOrdersPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", method: "all", city: "", min: "", max: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("shipped");
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const isAdmin = session?.user?.role === "admin";

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
    if (filters.city)
      list = list.filter((o) =>
        (o.shippingAddress?.city || "").toLowerCase().includes(filters.city.toLowerCase())
      );
    if (filters.min) list = list.filter((o) => o.totalAmount >= Number(filters.min));
    if (filters.max) list = list.filter((o) => o.totalAmount <= Number(filters.max));

    return list;
  }, [orders, tab, search, filters]);

  const activeFilterCount = Object.values(filters).filter((v) => v && v !== "all").length;

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
    await Promise.all(selectedIds.map((id) => fetch(`/api/orders/${id}`, { method: "DELETE" }).then((r) => r.json())));
    setSelectedIds([]);
    loadOrders();
    setUpdating(false);
  };

  // ===== CREATE ORDER =====
  const openCreate = async () => {
    setShowCreate(true);
    setCreateError("");
    if (!users.length || !products.length) {
      const [uRes, pRes] = await Promise.all([
        fetch("/api/users").then((r) => r.json()),
        fetch("/api/products?limit=100").then((r) => r.json()),
      ]);
      if (uRes.success) setUsers(uRes.data);
      if (pRes.success) setProducts(pRes.data.products || []);
    }
  };

  const createTotal = createForm.items.reduce((sum, row) => {
    const p = products.find((x) => x._id === row.product);
    return sum + (p ? getEffectivePrice(p) * (Number(row.quantity) || 1) : 0);
  }, 0);

  const submitCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    const items = createForm.items
      .filter((r) => r.product)
      .map((r) => ({ product: r.product, quantity: Number(r.quantity) || 1 }));
    if (!createForm.userId) return setCreateError("Select a customer");
    if (!items.length) return setCreateError("Add at least one product");
    if (!createForm.fullName || !createForm.phone || !createForm.address || !createForm.city)
      return setCreateError("Fill the complete shipping address");

    setCreating(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: createForm.userId,
          items,
          shippingAddress: {
            fullName: createForm.fullName,
            phone: createForm.phone,
            address: createForm.address,
            city: createForm.city,
          },
          paymentMethod: createForm.paymentMethod,
          paymentStatus: createForm.paymentStatus,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setShowCreate(false);
      setCreateForm(emptyCreate);
      loadOrders();
    } catch (err) {
      setCreateError(err.message);
    }
    setCreating(false);
  };

  const saveStatus = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${selected._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: selected.orderStatus, paymentStatus: selected.paymentStatus }),
      }).then((r) => r.json());
      if (res.success) {
        loadOrders();
        setSelected(null);
      } else alert(res.message);
    } catch {
      alert("Failed to update order");
    }
    setUpdating(false);
  };

  if (status === "loading" || loading) {
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
          <button
            onClick={openCreate}
            className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2.5 rounded-md text-sm transition-colors shadow-glow"
          >
            + Create Order
          </button>
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
              <label className="block text-[11px] text-zinc-400 mb-1">City</label>
              <input className={`${inputCls} w-full`} placeholder="e.g. Dhaka" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
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
                onClick={() => setFilters({ from: "", to: "", method: "all", city: "", min: "", max: "" })}
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
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 bg-accent/10 border border-accent/40 rounded-xl px-4 py-3">
            <span className="text-sm font-bold text-accent">{selectedIds.length} selected</span>
            <select className={selectCls} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s} className="bg-primary">{s}</option>
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
                      <p className="font-bold text-white">#{(o._id || "").slice(-6).toUpperCase()}</p>
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
                    <td className="p-4"><span className={badge(orderColors[o.orderStatus])}>{o.orderStatus}</span></td>
                    <td className="p-4 font-bold text-accent">{formatCurrency(o.totalAmount)}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => setSelected(o)} className="text-accent hover:underline font-bold text-xs">
                        View & Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== VIEW & UPDATE MODAL ===== */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={saveStatus} className="w-full max-w-lg bg-primary-light border border-white/10 rounded-xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Order #{(selected._id || "").slice(-6).toUpperCase()}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={`/invoice/${selected._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline font-bold text-xs"
                >
                  View Invoice
                </a>
                <button type="button" onClick={() => setSelected(null)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">✕</button>
              </div>
            </div>

            <div className="space-y-1 text-sm text-zinc-300 bg-black/20 rounded-md p-3 border border-white/5">
              <p><span className="text-zinc-500">Name:</span> {selected.shippingAddress?.fullName}</p>
              <p><span className="text-zinc-500">Phone:</span> {selected.shippingAddress?.phone}</p>
              <p><span className="text-zinc-500">Address:</span> {selected.shippingAddress?.address}, {selected.shippingAddress?.city}</p>
              <p><span className="text-zinc-500">Method:</span> {selected.paymentMethod === "cod" ? "Cash on Delivery" : "SSLCommerz"}</p>
              {selected.shippedAt && <p><span className="text-zinc-500">Shipped:</span> {formatDate(selected.shippedAt)}</p>}
              {selected.deliveredAt && <p><span className="text-zinc-500">Delivered:</span> {formatDate(selected.deliveredAt)}</p>}
            </div>

            {selected.paymentMethod === "cod" && selected.paymentStatus === "pending" && (
              <p className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-md px-3 py-2">
                COD order — customer product receive korle paymentStatus "paid" kore din.
              </p>
            )}

            <ShipmentPanel orderId={selected._id} />

            <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar bg-black/20 rounded-md p-3 border border-white/5">
              {(selected.items || []).map((it, i) => (
                <div key={i} className="flex justify-between text-sm text-zinc-300">
                  <span className="line-clamp-1 max-w-[70%]">{it.name} (×{it.quantity})</span>
                  <span className="font-bold text-accent">{formatCurrency((it.price || 0) * it.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Fulfillment Status</label>
                <select className={`${selectCls} w-full`} value={selected.orderStatus} onChange={(e) => setSelected({ ...selected, orderStatus: e.target.value })}>
                  {statusOptions.map((s) => (<option key={s} value={s} className="bg-primary">{s}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Payment Status</label>
                <select className={`${selectCls} w-full`} value={selected.paymentStatus} onChange={(e) => setSelected({ ...selected, paymentStatus: e.target.value })}>
                  {paymentOptions.map((s) => (<option key={s} value={s} className="bg-primary">{s}</option>))}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-white/10">
              <span className="text-sm text-zinc-400">
                Total {selected.shippingCost > 0 && <span className="text-[11px]">(incl. {formatCurrency(selected.shippingCost)} shipping{selected.shippingMethodName ? ` · ${selected.shippingMethodName}` : ""})</span>}
              </span>
              <span className="text-xl font-extrabold text-accent">{formatCurrency(selected.totalAmount)}</span>
            </div>

            <button type="submit" disabled={updating} className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50">
              {updating ? "Updating..." : "Save Changes"}
            </button>
          </form>
        </div>
      )}

      {/* ===== CREATE ORDER MODAL ===== */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={submitCreate} className="w-full max-w-xl bg-primary-light border border-white/10 rounded-xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Create Order</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">✕</button>
            </div>

            {createError && (
              <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{createError}</p>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Customer</label>
              <select className={`${selectCls} w-full`} value={createForm.userId} onChange={(e) => setCreateForm((f) => ({ ...f, userId: e.target.value }))}>
                <option value="" className="bg-primary">Select customer...</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id} className="bg-primary">{u.name} — {u.email}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-zinc-400">Products</label>
              {createForm.items.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    className={`${selectCls} flex-1`}
                    value={row.product}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        items: f.items.map((r, x) => (x === i ? { ...r, product: e.target.value } : r)),
                      }))
                    }
                  >
                    <option value="" className="bg-primary">Select product...</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id} className="bg-primary">
                        {p.name} — {formatCurrency(getEffectivePrice(p))} (stock: {p.stock})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    className={`${inputCls} w-20`}
                    value={row.quantity}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        items: f.items.map((r, x) => (x === i ? { ...r, quantity: e.target.value } : r)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setCreateForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== i) }))}
                    className="text-red-400 hover:bg-red-500/10 px-2 rounded"
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCreateForm((f) => ({ ...f, items: [...f.items, { product: "", quantity: 1 }] }))}
                className="text-xs text-accent hover:underline font-bold"
              >
                + Add another product
              </button>
              <p className="text-sm font-bold text-white pt-1">Total: <span className="text-accent">{formatCurrency(createTotal)}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input className={`${inputCls} w-full`} placeholder="Full name" value={createForm.fullName} onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))} />
              <input className={`${inputCls} w-full`} placeholder="Phone" value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} />
              <input className={`${inputCls} w-full`} placeholder="Address" value={createForm.address} onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))} />
              <input className={`${inputCls} w-full`} placeholder="City" value={createForm.city} onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Payment method</label>
                <select className={`${selectCls} w-full`} value={createForm.paymentMethod} onChange={(e) => setCreateForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                  <option value="cod" className="bg-primary">Cash on Delivery</option>
                  <option value="sslcommerz" className="bg-primary">SSLCommerz</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Payment status</label>
                <select className={`${selectCls} w-full`} value={createForm.paymentStatus} onChange={(e) => setCreateForm((f) => ({ ...f, paymentStatus: e.target.value }))}>
                  <option value="pending" className="bg-primary">pending</option>
                  <option value="paid" className="bg-primary">paid</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={creating} className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50">
              {creating ? "Creating..." : "Create Order"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}