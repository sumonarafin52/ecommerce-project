// app/admin/orders/[id]/page.js
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const selectCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-accent transition-colors";
const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";
const badge = (color) => `px-2.5 py-1 rounded-full text-[11px] font-bold capitalize whitespace-nowrap ${color}`;
const card = "bg-primary-light border border-white/10 rounded-xl p-5";

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
const fulfillColors = {
  unfulfilled: "bg-zinc-500/15 text-zinc-400",
  partially_fulfilled: "bg-amber-500/15 text-amber-400",
  fulfilled: "bg-green-500/15 text-green-400",
};
const fulfillLabels = {
  unfulfilled: "Unfulfilled",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
};
const shipmentStatusColors = {
  pending: "bg-zinc-500/15 text-zinc-400",
  shipped: "bg-blue-500/15 text-blue-400",
  in_transit: "bg-blue-500/15 text-blue-400",
  out_for_delivery: "bg-amber-500/15 text-amber-400",
  delivered: "bg-green-500/15 text-green-400",
  failed: "bg-red-500/15 text-red-400",
  returned: "bg-red-500/15 text-red-400",
};
const VALID_NEXT = {
  processing: ["processing", "shipped", "cancelled"],
  shipped: ["shipped", "delivered", "cancelled"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};
const SHIPMENT_STATUSES = ["shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned"];

// remaining (unfulfilled) quantity per item, computed client-side from the
// same rule as lib/orderStatus.js on the server
function computeRemaining(order) {
  const fulfilledMap = new Map();
  (order.fulfillments || []).forEach((f) => {
    (f.items || []).forEach((it) => {
      const key = String(it.product?._id || it.product);
      fulfilledMap.set(key, (fulfilledMap.get(key) || 0) + it.quantity);
    });
  });
  return (order.items || [])
    .map((it) => {
      const key = String(it.product);
      const done = fulfilledMap.get(key) || 0;
      return { product: key, name: it.name, remaining: Math.max(0, it.quantity - done) };
    })
    .filter((it) => it.remaining > 0);
}

function computeFulfillmentStatus(order) {
  const items = order.items || [];
  if (!items.length) return "unfulfilled";
  const remaining = computeRemaining(order);
  if (remaining.length === 0) return "fulfilled";
  if (remaining.length === items.length && (order.fulfillments || []).length === 0) return "unfulfilled";
  return remaining.length < items.length ? "partially_fulfilled" : "unfulfilled";
}

function CreateShipmentForm({ order, carriers, methods, onCreated, onCancel }) {
  const remaining = computeRemaining(order);
  const [qty, setQty] = useState(() => Object.fromEntries(remaining.map((r) => [r.product, r.remaining])));
  const [carrier, setCarrier] = useState("");
  const [method, setMethod] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const items = remaining
      .map((r) => ({ product: r.product, quantity: Number(qty[r.product]) || 0 }))
      .filter((r) => r.quantity > 0);
    if (!items.length) return toast.error("Select at least one item");
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${order._id}/fulfillments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, carrier, method, trackingNumber }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Shipment created");
      onCreated();
    } catch (err) {
      toast.error(err.message || "Failed to create shipment");
    }
    setSaving(false);
  };

  return (
    <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-3">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Items to fulfill</p>
      {remaining.map((r) => (
        <div key={r.product} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-300">{r.name} <span className="text-zinc-500">(max {r.remaining})</span></span>
          <input
            type="number"
            min="0"
            max={r.remaining}
            className={`${inputCls} w-20`}
            value={qty[r.product] ?? r.remaining}
            onChange={(e) => setQty((q) => ({ ...q, [r.product]: e.target.value }))}
          />
        </div>
      ))}
      <div className="grid sm:grid-cols-2 gap-3 pt-2">
        <select className={selectCls} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
          <option value="" className="bg-primary">No carrier</option>
          {carriers.map((c) => <option key={c._id} value={c._id} className="bg-primary">{c.name}</option>)}
        </select>
        <select className={selectCls} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="" className="bg-primary">No method</option>
          {methods.map((m) => <option key={m._id} value={m._id} className="bg-primary">{m.name}</option>)}
        </select>
      </div>
      <input
        className={`${inputCls} w-full`}
        placeholder="Tracking number (optional)"
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
      />
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-xs font-bold text-zinc-400 hover:text-white px-3 py-2">Cancel</button>
        <button
          onClick={submit}
          disabled={saving}
          className="bg-accent hover:bg-accent/80 text-primary text-xs font-bold px-4 py-2 rounded-md disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create shipment"}
        </button>
      </div>
    </div>
  );
}

function FulfillmentCard({ fulfillment, orderId, onUpdated }) {
  const [note, setNote] = useState("");
  const [eventStatus, setEventStatus] = useState("shipped");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState(fulfillment.trackingNumber || "");

  const addEvent = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/fulfillments/${fulfillment._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addEvent: { status: eventStatus, note, location } }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Shipment updated");
      setNote("");
      onUpdated();
    } catch (err) {
      toast.error(err.message || "Failed to update");
    }
    setSaving(false);
  };

  const saveTracking = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/fulfillments/${fulfillment._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Tracking number saved");
      setEditing(false);
      onUpdated();
    } catch (err) {
      toast.error(err.message || "Failed to save");
    }
    setSaving(false);
  };

  const trackUrl = fulfillment.carrier?.trackingUrlTemplate && fulfillment.trackingNumber
    ? fulfillment.carrier.trackingUrlTemplate.replace("{tracking_number}", fulfillment.trackingNumber)
    : null;

  return (
    <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={badge(shipmentStatusColors[fulfillment.status] || shipmentStatusColors.pending)}>
            {(fulfillment.status || "pending").replace(/_/g, " ")}
          </span>
          <span className="text-xs text-zinc-500">{fulfillment.carrier?.name || "No carrier"} {fulfillment.method?.name ? `· ${fulfillment.method.name}` : ""}</span>
        </div>
        {trackUrl && (
          <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-accent hover:underline">
            Track on carrier site ↗
          </a>
        )}
      </div>

      <div className="space-y-1 text-xs text-zinc-400">
        {fulfillment.items.map((it, i) => (
          <p key={i}>{it.name} × {it.quantity}</p>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input className={`${inputCls} flex-1`} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking number" />
            <button onClick={saveTracking} disabled={saving} className="text-xs font-bold text-accent hover:underline">Save</button>
          </>
        ) : (
          <>
            <span className="text-xs text-zinc-500">Tracking: {fulfillment.trackingNumber || "—"}</span>
            <button onClick={() => setEditing(true)} className="text-xs font-bold text-accent hover:underline">Edit</button>
          </>
        )}
      </div>

      {fulfillment.timeline?.length > 0 && (
        <div className="space-y-1.5 pl-3 border-l-2 border-white/10">
          {fulfillment.timeline.slice().reverse().map((ev, i) => (
            <div key={i} className="text-xs">
              <span className="text-white font-bold capitalize">{ev.status.replace(/_/g, " ")}</span>
              <span className="text-zinc-500"> — {formatDate(ev.at)}{ev.location ? ` · ${ev.location}` : ""}</span>
              {ev.note && <p className="text-zinc-500">{ev.note}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
        <select className={selectCls} value={eventStatus} onChange={(e) => setEventStatus(e.target.value)}>
          {SHIPMENT_STATUSES.map((s) => <option key={s} value={s} className="bg-primary">{s.replace(/_/g, " ")}</option>)}
        </select>
        <input className={`${inputCls} flex-1 min-w-[100px]`} placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <button onClick={addEvent} disabled={saving} className="bg-accent/20 hover:bg-accent/30 text-accent text-xs font-bold px-3 py-2 rounded-md disabled:opacity-50">
          + Add update
        </button>
      </div>
    </div>
  );
}

export default function OrderDetailsPage() {
  const { id } = useParams();
  const { data: session, status } = useSession();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [carriers, setCarriers] = useState([]);
  const [methods, setMethods] = useState([]);
  const [showCreateShipment, setShowCreateShipment] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(null);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);

  const isStaff = ["admin", "editor", "order_processing", "support"].includes(session?.user?.role);

  const load = useCallback(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setOrder(res.data);
        else toast.error(res.message || "Order not found");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  useEffect(() => {
    Promise.all([
      fetch("/api/shipping/carriers").then((r) => r.json()),
      fetch("/api/shipping/methods").then((r) => r.json()),
    ]).then(([c, m]) => {
      if (c.success) setCarriers(c.data);
      if (m.success) setMethods(m.data);
    });
  }, []);

  const setStatus = async (orderStatus) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Order status updated");
      setOrder(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    }
    setBusy(false);
  };

  const setPaymentStatus = async (paymentStatus) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Payment status updated");
      setOrder(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to update");
    }
    setBusy(false);
  };

  const toggleHold = async () => {
    const onHold = !order.onHold;
    const holdReason = onHold ? window.prompt("Reason for hold (optional):") || "" : "";
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onHold, holdReason }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setOrder(res.data);
      toast.success(onHold ? "Order put on hold" : "Hold released");
    } catch (err) {
      toast.error(err.message || "Failed to update");
    }
    setBusy(false);
  };

  const cancelOrder = async () => {
    if (!window.confirm("Cancel this order? Stock will be restored.")) return;
    await setStatus("cancelled");
  };

  const saveAddress = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingAddress: addressForm }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setOrder(res.data);
      setEditingAddress(false);
      toast.success("Address updated");
    } catch (err) {
      toast.error(err.message || "Failed to save address");
    }
    setBusy(false);
  };

  const submitRefund = async () => {
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: refundReason }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setOrder(res.data);
      setShowRefund(false);
      toast.success("Refund recorded");
    } catch (err) {
      toast.error(err.message || "Failed to record refund");
    }
    setBusy(false);
  };

  if (status === "loading" || loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !isStaff) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access required</p>
        <Link href="/admin/orders" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Order not found</p>
        <Link href="/admin/orders" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to Orders
        </Link>
      </div>
    );
  }

  const fulfillmentStatus = computeFulfillmentStatus(order);
  const remaining = computeRemaining(order);
  const subtotal = order.baseAmount || order.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* breadcrumb + header */}
        <div>
          <Link href="/admin/orders" className="text-xs text-zinc-400 hover:text-accent font-bold">← Back to Orders</Link>
          <div className="flex flex-wrap items-start justify-between gap-4 mt-2">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white">Order #{(order._id || "").slice(-6).toUpperCase()}</h1>
                <span className={badge(orderColors[order.orderStatus])}>{order.orderStatus}</span>
                <span className={badge(payColors[order.paymentStatus])}>{order.paymentStatus}</span>
                <span className={badge(fulfillColors[fulfillmentStatus])}>{fulfillLabels[fulfillmentStatus]}</span>
                {order.onHold && <span className={badge("bg-red-500/15 text-red-400")}>On hold</span>}
                {order.paymentMethod === "cod" && <span className={badge("bg-blue-500/15 text-blue-400")}>COD</span>}
              </div>
              <p className="text-sm text-zinc-400 mt-1">{formatDate(order.createdAt)} · {order.user?.name || "Unknown customer"}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a href={`/invoice/${order._id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold border border-white/15 hover:border-accent hover:text-accent text-zinc-300 px-3 py-2 rounded-md transition-colors">
                View Invoice
              </a>
              <a href={`mailto:${order.user?.email || ""}`} className="text-xs font-bold border border-white/15 hover:border-accent hover:text-accent text-zinc-300 px-3 py-2 rounded-md transition-colors">
                Email Customer
              </a>
              <a href={`tel:${order.shippingAddress?.phone || ""}`} className="text-xs font-bold border border-white/15 hover:border-accent hover:text-accent text-zinc-300 px-3 py-2 rounded-md transition-colors">
                Call Customer
              </a>
              <button onClick={toggleHold} disabled={busy} className="text-xs font-bold border border-white/15 hover:border-amber-400 hover:text-amber-400 text-zinc-300 px-3 py-2 rounded-md transition-colors disabled:opacity-50">
                {order.onHold ? "Release hold" : "Put on hold"}
              </button>
              {order.orderStatus !== "cancelled" && order.orderStatus !== "delivered" && (
                <button onClick={cancelOrder} disabled={busy} className="text-xs font-bold border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-md transition-colors disabled:opacity-50">
                  Cancel Order
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* ===== MAIN COLUMN ===== */}
          <div className="lg:col-span-2 space-y-5">
            {/* items */}
            <div className={card}>
              <h2 className="text-sm font-bold text-white mb-4">Items</h2>
              <div className="space-y-3">
                {order.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-white/5 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-white font-medium">{it.name}</p>
                      {it.sku && <p className="text-xs text-zinc-500">SKU: {it.sku}</p>}
                      <p className="text-xs text-zinc-500">Qty {it.quantity} × {formatCurrency(it.price)}</p>
                    </div>
                    <p className="font-bold text-accent">{formatCurrency(it.price * it.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 mt-4 pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-green-400"><span>Discount {order.discountCode && `(${order.discountCode})`}</span><span>-{formatCurrency(order.discountAmount)}</span></div>
                )}
                <div className="flex justify-between text-zinc-400">
                  <span>Shipping {order.shippingMethodName && `(${order.shippingMethodName})`}</span>
                  <span>{order.shippingCost > 0 ? formatCurrency(order.shippingCost) : "Free"}</span>
                </div>
                <div className="flex justify-between text-white font-extrabold text-base pt-1.5 border-t border-white/10 mt-1.5">
                  <span>Total</span><span className="text-accent">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* fulfillment */}
            <div className={card}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white">Shipping & Fulfillment</h2>
                {remaining.length > 0 && !showCreateShipment && (
                  <button onClick={() => setShowCreateShipment(true)} className="text-xs font-bold text-accent hover:underline">
                    + Create shipment
                  </button>
                )}
              </div>

              {showCreateShipment && (
                <div className="mb-4">
                  <CreateShipmentForm
                    order={order}
                    carriers={carriers}
                    methods={methods}
                    onCreated={() => { setShowCreateShipment(false); load(); }}
                    onCancel={() => setShowCreateShipment(false)}
                  />
                </div>
              )}

              {order.fulfillments?.length > 0 ? (
                <div className="space-y-3">
                  {order.fulfillments.map((f) => (
                    <FulfillmentCard key={f._id} fulfillment={f} orderId={order._id} onUpdated={load} />
                  ))}
                </div>
              ) : (
                !showCreateShipment && <p className="text-sm text-zinc-500 text-center py-6">No shipments created yet.</p>
              )}

              {remaining.length > 0 && order.fulfillments?.length > 0 && (
                <p className="text-xs text-amber-400 mt-3">
                  {remaining.length} item{remaining.length > 1 ? "s" : ""} still unfulfilled.
                </p>
              )}
            </div>

            {/* activity timeline */}
            <div className={card}>
              <h2 className="text-sm font-bold text-white mb-4">Activity</h2>
              {order.activity?.length > 0 ? (
                <div className="space-y-3 pl-3 border-l-2 border-white/10">
                  {order.activity.slice().reverse().map((a, i) => (
                    <div key={i} className="text-sm">
                      <p className="text-zinc-200">{a.message}</p>
                      <p className="text-xs text-zinc-500">{formatDate(a.at)} · {a.by?.name || "System"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No activity recorded yet.</p>
              )}
            </div>
          </div>

          {/* ===== SIDEBAR ===== */}
          <div className="space-y-5">
            {/* status management */}
            <div className={card}>
              <h2 className="text-sm font-bold text-white mb-3">Order Status</h2>
              <select
                className={`${selectCls} w-full mb-3`}
                value={order.orderStatus}
                disabled={busy}
                onChange={(e) => setStatus(e.target.value)}
              >
                {(VALID_NEXT[order.orderStatus] || [order.orderStatus]).map((s) => (
                  <option key={s} value={s} className="bg-primary">{s}</option>
                ))}
              </select>

              <h2 className="text-sm font-bold text-white mb-3 mt-4">Payment Status</h2>
              <select
                className={`${selectCls} w-full`}
                value={order.paymentStatus}
                disabled={busy || order.paymentStatus === "refunded"}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                {["pending", "paid", "failed", "refunded"].map((s) => (
                  <option key={s} value={s} className="bg-primary">{s}</option>
                ))}
              </select>

              {order.paymentStatus === "paid" && !showRefund && (
                <button onClick={() => setShowRefund(true)} className="w-full mt-3 text-xs font-bold border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-md transition-colors">
                  Issue refund
                </button>
              )}
              {showRefund && (
                <div className="mt-3 space-y-2 bg-black/20 border border-white/10 rounded-lg p-3">
                  <input type="number" min="0" max={order.totalAmount} className={`${inputCls} w-full`} placeholder={`Amount (max ${order.totalAmount})`} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                  <input className={`${inputCls} w-full`} placeholder="Reason (optional)" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowRefund(false)} className="text-xs font-bold text-zinc-400 hover:text-white px-2 py-1.5">Cancel</button>
                    <button onClick={submitRefund} disabled={busy} className="text-xs font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-md disabled:opacity-50">Confirm refund</button>
                  </div>
                </div>
              )}
              {order.refund?.refundedAt && (
                <p className="text-xs text-zinc-500 mt-2">
                  Refunded {formatCurrency(order.refund.amount)} on {formatDate(order.refund.refundedAt)}
                  {order.refund.reason ? ` — ${order.refund.reason}` : ""}
                </p>
              )}
            </div>

            {/* payment info */}
            <div className={card}>
              <h2 className="text-sm font-bold text-white mb-3">Payment</h2>
              <div className="space-y-1.5 text-sm text-zinc-300">
                <p><span className="text-zinc-500">Method:</span> {order.paymentMethod === "cod" ? "Cash on Delivery" : "SSLCommerz"}</p>
                <p><span className="text-zinc-500">Status:</span> <span className="capitalize">{order.paymentStatus}</span></p>
                <p><span className="text-zinc-500">Amount:</span> {formatCurrency(order.totalAmount)}</p>
                {order.paymentVerifiedAt && <p><span className="text-zinc-500">Verified:</span> {formatDate(order.paymentVerifiedAt)}</p>}
              </div>
            </div>

            {/* customer info */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white">Customer</h2>
                {!editingAddress && (
                  <button onClick={() => { setAddressForm(order.shippingAddress); setEditingAddress(true); }} className="text-xs font-bold text-accent hover:underline">
                    Edit address
                  </button>
                )}
              </div>
              <div className="space-y-1.5 text-sm text-zinc-300 mb-3">
                <p className="text-white font-medium">{order.user?.name}</p>
                <p className="text-zinc-500">{order.user?.email}</p>
              </div>

              {editingAddress ? (
                <div className="space-y-2 bg-black/20 border border-white/10 rounded-lg p-3">
                  <input className={`${inputCls} w-full`} placeholder="Full name" value={addressForm.fullName} onChange={(e) => setAddressForm((f) => ({ ...f, fullName: e.target.value }))} />
                  <input className={`${inputCls} w-full`} placeholder="Phone" value={addressForm.phone} onChange={(e) => setAddressForm((f) => ({ ...f, phone: e.target.value }))} />
                  <input className={`${inputCls} w-full`} placeholder="Address" value={addressForm.address} onChange={(e) => setAddressForm((f) => ({ ...f, address: e.target.value }))} />
                  <input className={`${inputCls} w-full`} placeholder="City" value={addressForm.city} onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))} />
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditingAddress(false)} className="text-xs font-bold text-zinc-400 hover:text-white px-2 py-1.5">Cancel</button>
                    <button onClick={saveAddress} disabled={busy} className="text-xs font-bold bg-accent text-primary px-3 py-1.5 rounded-md disabled:opacity-50">Save</button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-300 bg-black/20 rounded-md p-3 border border-white/5 space-y-1">
                  <p>{order.shippingAddress?.fullName}</p>
                  <p className="text-zinc-500">{order.shippingAddress?.phone}</p>
                  <p className="text-zinc-500">{order.shippingAddress?.address}, {order.shippingAddress?.city}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
