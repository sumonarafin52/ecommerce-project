// app/admin/orders/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";

const statusOptions = ["processing", "shipped", "delivered", "cancelled"];
const paymentOptions = ["pending", "paid", "failed", "refunded"];

const selectCls =
  "w-full bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-accent transition-colors";

const badge = (color) => `px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${color}`;

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

export default function AdminOrdersPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);

  const isAdmin = session?.user?.role === "admin";

  const loadOrders = () => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const ordersData = res.data;
          const ordersList = Array.isArray(ordersData) ? ordersData : (ordersData.orders || []);
          setOrders(ordersList);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && isAdmin) loadOrders();
    else setLoading(false);
  }, [status, isAdmin]);

  const saveStatus = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${selected._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderStatus: selected.orderStatus,
          paymentStatus: selected.paymentStatus,
        }),
      }).then((r) => r.json());

      if (res.success) {
        loadOrders();
        setSelected(null);
      } else {
        alert(res.message);
      }
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
        <Link
          href="/"
          className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Manage Orders</h1>
          <span className="text-sm text-zinc-400">{orders.length} total orders</span>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">
            No orders placed yet.
          </div>
        ) : (
          <div className="overflow-x-auto bg-primary-light border border-white/10 rounded-xl">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead>
                <tr className="text-zinc-400 border-b border-white/10">
                  <th className="p-4 font-medium">Order ID</th>
                  <th className="p-4 font-medium">Customer</th>
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Total</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-white">#{(o._id || "").slice(-6).toUpperCase()}</td>
                    <td className="p-4 text-zinc-300">
                      {o.user?.name || "Unknown"}
                      <p className="text-xs text-zinc-500">{o.user?.email}</p>
                    </td>
                    <td className="p-4 text-zinc-400">{formatDate(o.createdAt)}</td>
                    <td className="p-4 font-bold text-accent">{formatCurrency(o.totalAmount)}</td>
                    <td className="p-4 flex flex-col gap-1">
                      <span className={badge(orderColors[o.orderStatus])}>{o.orderStatus}</span>
                      <span className={badge(payColors[o.paymentStatus])}>{o.paymentStatus}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelected(o)}
                        className="text-accent hover:underline font-bold text-xs"
                      >
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

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={saveStatus}
            className="w-full max-w-lg bg-primary-light border border-white/10 rounded-xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                Order #{(selected._id || "").slice(-6).toUpperCase()}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-white text-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-sm text-zinc-300 bg-black/20 rounded-md p-3 border border-white/5">
              <p><span className="text-zinc-500">Name:</span> {selected.shippingAddress?.fullName}</p>
              <p><span className="text-zinc-500">Phone:</span> {selected.shippingAddress?.phone}</p>
              <p><span className="text-zinc-500">Address:</span> {selected.shippingAddress?.address}, {selected.shippingAddress?.city}</p>
            </div>

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
                <label className="block text-xs text-zinc-400 mb-1">Order Status</label>
                <select
                  className={selectCls}
                  value={selected.orderStatus}
                  onChange={(e) => setSelected({ ...selected, orderStatus: e.target.value })}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s} className="bg-primary">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Payment Status</label>
                <select
                  className={selectCls}
                  value={selected.paymentStatus}
                  onChange={(e) => setSelected({ ...selected, paymentStatus: e.target.value })}
                >
                  {paymentOptions.map((s) => (
                    <option key={s} value={s} className="bg-primary">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-white/10">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-xl font-extrabold text-accent">{formatCurrency(selected.totalAmount)}</span>
            </div>

            <button
              type="submit"
              disabled={updating}
              className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50"
            >
              {updating ? "Updating..." : "Save Changes"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}