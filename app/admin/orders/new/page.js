// app/admin/orders/new/page.js
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";

const selectCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-accent transition-colors";
const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";
const card = "bg-primary-light border border-white/10 rounded-xl p-5";

const emptyForm = {
  userId: "",
  items: [{ product: "", quantity: 1 }],
  fullName: "",
  phone: "",
  address: "",
  city: "",
  paymentMethod: "cod",
  paymentStatus: "pending",
};

export default function CreateOrderPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Same permission that gates bulk mutations on the order list — creating
  // an order is a mutation, not just a read.
  const canCreate = can("orders_update");

  useEffect(() => {
    if (status !== "authenticated" || !canCreate) return;
    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/products?limit=100").then((r) => r.json()),
    ])
      .then(([uRes, pRes]) => {
        if (uRes.success) setUsers(uRes.data);
        if (pRes.success) setProducts(pRes.data.products || []);
      })
      .finally(() => setLoadingData(false));
  }, [status, canCreate]);

  const total = form.items.reduce((sum, row) => {
    const p = products.find((x) => x._id === row.product);
    return sum + (p ? getEffectivePrice(p) * (Number(row.quantity) || 1) : 0);
  }, 0);

  const selectedCustomer = users.find((u) => u._id === form.userId);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const items = form.items.filter((r) => r.product).map((r) => ({ product: r.product, quantity: Number(r.quantity) || 1 }));
    if (!form.userId) return setError("Select a customer");
    if (!items.length) return setError("Add at least one product");
    if (!form.fullName || !form.phone || !form.address || !form.city) return setError("Fill the complete shipping address");

    setCreating(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: form.userId,
          items,
          shippingAddress: { fullName: form.fullName, phone: form.phone, address: form.address, city: form.city },
          paymentMethod: form.paymentMethod,
          paymentStatus: form.paymentStatus,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Order created");
      // straight into the same dedicated Order Details page an order
      // number click opens elsewhere — the whole point of this page
      router.push(`/admin/orders/${res.data._id}`);
    } catch (err) {
      setError(err.message || "Failed to create order");
    }
    setCreating(false);
  };

  if (status === "loading" || permLoading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !canCreate) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access required</p>
        <Link href="/admin/orders" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* breadcrumb + header — same pattern as the Order Details page */}
        <div>
          <Link href="/admin/orders" className="text-xs text-zinc-400 hover:text-accent font-bold">← Back to Orders</Link>
          <h1 className="text-2xl font-bold text-white mt-2">Create Order</h1>
          <p className="text-sm text-zinc-400 mt-1">Manually place an order on behalf of a customer — e.g. a phone/in-store sale.</p>
        </div>

        {loadingData ? (
          <div className={card}>
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <form onSubmit={submit} className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              {error && (
                <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{error}</p>
              )}

              <div className={card}>
                <h2 className="text-sm font-bold text-white mb-4">Customer</h2>
                <select className={`${selectCls} w-full`} value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                  <option value="" className="bg-primary">Select customer...</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id} className="bg-primary">{u.name} — {u.email}</option>
                  ))}
                </select>
              </div>

              <div className={card}>
                <h2 className="text-sm font-bold text-white mb-4">Products</h2>
                <div className="space-y-2">
                  {form.items.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        className={`${selectCls} flex-1`}
                        value={row.product}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, items: f.items.map((r, x) => (x === i ? { ...r, product: e.target.value } : r)) }))
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
                          setForm((f) => ({ ...f, items: f.items.map((r, x) => (x === i ? { ...r, quantity: e.target.value } : r)) }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== i) }))}
                        className="text-red-400 hover:bg-red-500/10 px-2 rounded"
                        aria-label="Remove row"
                        disabled={form.items.length === 1}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, items: [...f.items, { product: "", quantity: 1 }] }))}
                    className="text-xs text-accent hover:underline font-bold"
                  >
                    + Add another product
                  </button>
                </div>
              </div>

              <div className={card}>
                <h2 className="text-sm font-bold text-white mb-4">Shipping Address</h2>
                <div className="grid grid-cols-2 gap-3">
                  <input className={`${inputCls} w-full`} placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
                  <input className={`${inputCls} w-full`} placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                  <input className={`${inputCls} w-full col-span-2`} placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                  <input className={`${inputCls} w-full`} placeholder="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          fullName: selectedCustomer.name || f.fullName,
                          phone: selectedCustomer.phone || f.phone,
                        }))
                      }
                      className="text-xs text-accent hover:underline font-bold text-left"
                    >
                      Use {selectedCustomer.name}'s saved name/phone
                    </button>
                  )}
                </div>
              </div>

              <div className={card}>
                <h2 className="text-sm font-bold text-white mb-4">Payment</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Payment method</label>
                    <select className={`${selectCls} w-full`} value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                      <option value="cod" className="bg-primary">Cash on Delivery</option>
                      <option value="sslcommerz" className="bg-primary">SSLCommerz</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Payment status</label>
                    <select className={`${selectCls} w-full`} value={form.paymentStatus} onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value }))}>
                      <option value="pending" className="bg-primary">Pending</option>
                      <option value="paid" className="bg-primary">Paid</option>
                    </select>
                  </div>
                </div>
                {form.paymentMethod === "sslcommerz" && form.paymentStatus === "pending" && (
                  <p className="text-[11px] text-zinc-500 mt-2">
                    This order will start as "Pending" until payment is confirmed — the customer will need to be sent a
                    payment link separately, since this form records the order but doesn't trigger a gateway checkout session.
                  </p>
                )}
              </div>
            </div>

            {/* summary sidebar */}
            <div className="space-y-5">
              <div className={`${card} sticky top-6`}>
                <h2 className="text-sm font-bold text-white mb-4">Order Summary</h2>
                <div className="space-y-2 text-sm">
                  {form.items.filter((r) => r.product).map((row, i) => {
                    const p = products.find((x) => x._id === row.product);
                    if (!p) return null;
                    return (
                      <div key={i} className="flex justify-between text-zinc-400">
                        <span className="truncate pr-2">{p.name} × {row.quantity}</span>
                        <span className="text-white shrink-0">{formatCurrency(getEffectivePrice(p) * (Number(row.quantity) || 1))}</span>
                      </div>
                    );
                  })}
                  {!form.items.some((r) => r.product) && <p className="text-xs text-zinc-500">No products added yet.</p>}
                </div>
                <div className="border-t border-white/10 mt-3 pt-3 flex justify-between">
                  <span className="font-bold text-white">Total</span>
                  <span className="font-bold text-accent">{formatCurrency(total)}</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-2">Shipping cost isn't included here — add it from the Order Details page after creating, if needed.</p>
                <button type="submit" disabled={creating} className="w-full mt-4 bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50">
                  {creating ? "Creating..." : "Create Order"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
