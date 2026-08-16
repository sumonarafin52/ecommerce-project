// app/admin/discounts/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";

const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

const emptyForm = {
  code: "",
  description: "",
  type: "percentage",
  value: "",
  scope: "all",
  target: "",
  minAmount: "",
  usageLimit: "",
  expiresAt: "",
  active: true,
};

export default function AdminDiscountsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [discounts, setDiscounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    Promise.all([
      fetch("/api/discounts").then((r) => r.json()),
      fetch("/api/products?limit=100").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ])
      .then(([dRes, pRes, uRes]) => {
        if (dRes.success) setDiscounts(dRes.data);
        if (pRes.success) setProducts(pRes.data.products || []);
        if (uRes.success) setUsers(uRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && can("discounts")) load();
    else setLoading(false);
  }, [status, can]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (d) => {
    setEditingId(d._id);
    setForm({
      code: d.code,
      description: d.description || "",
      type: d.type,
      value: String(d.value),
      scope: d.scope,
      target: d.target || "",
      minAmount: d.minAmount ? String(d.minAmount) : "",
      usageLimit: d.usageLimit ? String(d.usageLimit) : "",
      expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString().slice(0, 10) : "",
      active: d.active,
    });
    setError("");
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        code: form.code,
        description: form.description,
        type: form.type,
        value: Number(form.value),
        scope: form.scope,
        target: form.scope === "all" ? "" : form.target,
        minAmount: Number(form.minAmount) || 0,
        usageLimit: Number(form.usageLimit) || 0,
        expiresAt: form.expiresAt || null,
        active: form.active,
      };
      const res = await fetch(editingId ? `/api/discounts/${editingId}` : "/api/discounts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (res.success) {
        setShowForm(false);
        load();
      } else setError(res.message);
    } catch {
      setError("Failed to save discount");
    }
    setSaving(false);
  };

  const toggleActive = async (d) => {
    await fetch(`/api/discounts/${d._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !d.active }),
    }).then((r) => r.json());
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this discount code?")) return;
    await fetch(`/api/discounts/${id}`, { method: "DELETE" }).then((r) => r.json());
    load();
  };

  const targetLabel = (d) => {
    if (d.scope === "all") return "Entire store";
    if (d.scope === "category") return `Category: ${d.target}`;
    if (d.scope === "product") return `Product: ${products.find((p) => p._id === d.target)?.name || d.target}`;
    if (d.scope === "customer") return `Customer: ${users.find((u) => u._id === d.target)?.name || d.target}`;
    return d.target;
  };

  if (status === "loading" || loading || permLoading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !can("discounts")) {
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Discounts
            <span className="bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 rounded-full">{discounts.length}</span>
          </h1>
          <button
            onClick={openCreate}
            className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2.5 rounded-md text-sm transition-colors shadow-glow"
          >
            + Create Discount
          </button>
        </div>

        {discounts.length === 0 ? (
          <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">
            No discount codes yet. Create your first coupon!
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {discounts.map((d) => (
              <div key={d._id} className={`bg-primary-light border rounded-xl p-5 space-y-3 transition-colors ${d.active ? "border-white/10 hover:border-accent/60" : "border-white/5 opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-extrabold text-accent tracking-wider">{d.code}</p>
                    <p className="text-[11px] text-zinc-500">{d.description || "No description"}</p>
                  </div>
                  <button
                    onClick={() => toggleActive(d)}
                    title={d.active ? "Deactivate" : "Activate"}
                    className={`w-11 h-6 rounded-full transition-colors relative ${d.active ? "bg-green-500/60" : "bg-zinc-600"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${d.active ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="bg-accent/15 text-accent text-sm font-extrabold px-3 py-1 rounded-md">
                    {d.type === "percentage" ? `${d.value}% OFF` : `${formatCurrency(d.value)} OFF`}
                  </span>
                  <span className="text-[11px] text-zinc-400 bg-white/5 px-2 py-1 rounded-md">{targetLabel(d)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
                  <div>
                    <p className="text-zinc-500">Used</p>
                    <p className="font-bold text-white">
                      {d.usedCount} / {d.usageLimit || "∞"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Min Order</p>
                    <p className="font-bold text-white">{d.minAmount ? formatCurrency(d.minAmount) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Expires</p>
                    <p className="font-bold text-white">{d.expiresAt ? formatDate(d.expiresAt) : "Never"}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => openEdit(d)}
                    className="flex-1 text-zinc-300 hover:text-accent font-bold text-xs border border-white/15 hover:border-accent rounded-md px-3 py-2 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(d._id)}
                    className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-md px-3 py-2 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* create/edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={save} className="w-full max-w-lg bg-primary-light border border-white/10 rounded-xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editingId ? "Edit Discount" : "Create Discount"}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">
                ✕
              </button>
            </div>

            {error && <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Code</label>
                <input className={`${inputCls} w-full uppercase`} placeholder="EID20" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description</label>
                <input className={`${inputCls} w-full`} placeholder="Eid special offer" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Type</label>
                <select className={`${inputCls} w-full`} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="percentage" className="bg-primary">Percentage (%)</option>
                  <option value="fixed" className="bg-primary">Fixed amount (৳)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Value</label>
                <input type="number" min="1" className={`${inputCls} w-full`} placeholder={form.type === "percentage" ? "1-100" : "50"} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Applies to</label>
                <select className={`${inputCls} w-full`} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, target: "" }))}>
                  <option value="all" className="bg-primary">Entire store</option>
                  <option value="category" className="bg-primary">Specific category</option>
                  <option value="product" className="bg-primary">Specific product</option>
                  <option value="customer" className="bg-primary">Specific customer</option>
                </select>
              </div>
              {form.scope !== "all" && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Target</label>
                  {form.scope === "category" ? (
                    <input className={`${inputCls} w-full`} placeholder="Category name" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
                  ) : form.scope === "product" ? (
                    <select className={`${inputCls} w-full`} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}>
                      <option value="" className="bg-primary">Select product...</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id} className="bg-primary">{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select className={`${inputCls} w-full`} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}>
                      <option value="" className="bg-primary">Select customer...</option>
                      {users.map((u) => (
                        <option key={u._id} value={u._id} className="bg-primary">{u.name} — {u.email}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Min order (৳)</label>
                <input type="number" min="0" className={`${inputCls} w-full`} value={form.minAmount} onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Usage limit</label>
                <input type="number" min="0" className={`${inputCls} w-full`} placeholder="0 = ∞" value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Expires on</label>
                <input type="date" className={`${inputCls} w-full`} value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="accent-[#f5a623] w-4 h-4" />
              <span className="text-sm font-bold text-zinc-200">Active (customer ra use korte parbe)</span>
            </label>

            <button type="submit" disabled={saving} className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Discount"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}