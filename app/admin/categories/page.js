// app/admin/categories/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const inputCls = "admin-input w-full";
const labelCls = "block text-[11px] font-bold text-zinc-300 mb-1.5 uppercase tracking-wider";

const emptyForm = { name: "", subcategories: [], image: "" };

export default function AdminCategoriesPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  const [loadError, setLoadError] = useState(false);

  const [categories, setCategories] = useState([]);
  const [usedNames, setUsedNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [subInput, setSubInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [edit, setEdit] = useState(null);
  const [editSubInput, setEditSubInput] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fileRef = useRef(null);

  // categories actually used by public products (some may never have been
  // created here — the storefront shows those too, which made an empty admin
  // list look wrong)
  const loadUsed = () => {
    setLoadError(false);
    fetch("/api/categories?scope=storefront", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setUsedNames(res.data.filter((x) => x.derived).map((x) => x.name));
        else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  };

  const load = () => {
    loadUsed();
    setLoadError(false);
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setCategories(res.data);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && can("products")) load();
    else setLoading(false);
  }, [status, can]);

  const addSub = (target, value, setter) => {
    const v = value.trim();
    if (!v) return;
    setter((f) => ({
      ...f,
      subcategories: f.subcategories.includes(v) ? f.subcategories : [...f.subcategories, v],
    }));
  };

  const uploadImage = async (file, setter) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
    const url = res.url || res.secure_url || res.data?.url || res.data?.secure_url;
    if (url) setter((f) => ({ ...f, image: url }));
    else setError(res.message || "Image upload failed");
  };

  // add a product-derived category as a real record, keeping its name exactly
  const quickAdd = async (name) => {
    setSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subcategories: [] }),
      }).then((r) => r.json());
      if (res.success) load();
      else setError(res.message);
    } catch {
      setError("Failed to add category");
    }
    setSaving(false);
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Category name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then((r) => r.json());
      if (res.success) {
        setForm(emptyForm);
        setSubInput("");
        load();
      } else setError(res.message);
    } catch {
      setError("Failed to create category");
    }
    setSaving(false);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!edit) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/categories/${edit._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      }).then((r) => r.json());
      if (res.success) {
        setEdit(null);
        load();
      } else alert(res.message);
    } catch {
      alert("Failed to update category");
    }
    setEditSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this category? Existing products will keep their category name.")) return;
    await fetch(`/api/categories/${id}`, { method: "DELETE" }).then((r) => r.json());
    load();
  };

  if (status === "loading" || permLoading || loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("products")) {
    return (
      <PermissionGate
        perm="products"
        what="products"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="categories" onRetry={() => { setLoadError(false); load(); }} />;
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Categories
            <span className="bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 rounded-full">{categories.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Organise products into categories and subcategories. They appear in the product form and across the store.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* ===== CREATE CARD ===== */}
          <form onSubmit={create} className="admin-card rounded-2xl p-6 space-y-4 lg:sticky lg:top-4">
            <h2 className="text-base font-extrabold text-white flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </span>
              New Category
            </h2>

            {error && <p className="text-sm font-bold text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg px-4 py-3">{error}</p>}

            <div>
              <label className={labelCls}>Category Name *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Electronics" />
            </div>

            <div>
              <label className={labelCls}>Subcategories</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(form, subInput, setForm); setSubInput(""); } }}
                  placeholder="Type & press Enter"
                />
                <Button size="sm" type="button" onClick={() => { addSub(form, subInput, setForm); setSubInput(""); }}>+</Button>
              </div>
              {form.subcategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.subcategories.map((s) => (
                    <span key={s} className="flex items-center gap-1.5 text-[11px] font-bold bg-accent/15 text-accent px-2.5 py-1 rounded-full border border-accent/30">
                      {s}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, subcategories: f.subcategories.filter((x) => x !== s) }))} className="hover:text-rose-400">✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Image (optional)</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileRef.current?.click()} className="border border-white/15 hover:border-accent text-zinc-300 hover:text-accent text-xs font-bold px-4 py-2.5 rounded-lg transition-colors">
                  Upload Image
                </button>
                {form.image && (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10">
                    <img src={form.image} alt="Category" className="w-full h-full object-contain bg-black/30" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, image: "" }))} className="absolute inset-0 bg-black/60 text-rose-400 text-[10px] font-bold opacity-0 hover:opacity-100 transition-opacity">✕</button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { uploadImage(e.target.files?.[0], setForm); e.target.value = ""; }} />
              </div>
            </div>

            <Button type="submit" full disabled={saving}>
              {saving ? "Creating..." : "✨ Create Category"}
            </Button>
          </form>

          {/* ===== LIST ===== */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {usedNames.length > 0 && (
              <div className="col-span-full admin-card rounded-xl p-4">
                <p className="text-[13px] font-semibold text-[#303030]">
                  {categories.length === 0 ? "Your products already use these categories" : "Used by products, but not added here"}
                </p>
                <p className="text-[12px] admin-text-muted mt-0.5">
                  They already show on your store. Add one here to give it an image and control its order.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {usedNames.map((n) => (
                    <button
                      key={n}
                      onClick={() => quickAdd(n)}
                      disabled={saving}
                      className="text-[12.5px] font-semibold border border-[#CCCCCC] hover:border-accent hover:text-accent rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      + {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {categories.length === 0 && usedNames.length === 0 && (
              <div className="col-span-full text-center py-14 admin-text-muted border border-dashed border-[#CCCCCC] rounded-xl">
                No categories yet — create your first one.
              </div>
            )}
            {categories.map((c) => (
              <div key={c._id} className="admin-card rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-orange-500/20 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {c.image ? <img src={c.image} alt={c.name} className="w-full h-full object-contain" /> : <span className="text-accent font-extrabold">{c.name.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-zinc-500">{c.subcategories.length} subcategories</p>
                  </div>
                </div>

                {c.subcategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.subcategories.map((s) => (
                      <span key={s} className="text-[10px] font-bold bg-white/5 text-zinc-300 px-2 py-1 rounded-full border border-white/10">{s}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEdit({ ...c }); setEditSubInput(""); }} className="flex-1 text-zinc-300 hover:text-accent font-bold text-xs border border-white/15 hover:border-accent rounded-lg px-3 py-2 transition-colors">Edit</button>
                  <button onClick={() => remove(c._id)} className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-lg px-3 py-2 transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== EDIT MODAL ===== */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md bg-primary-light border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edit Category</h2>
              <button type="button" onClick={() => setEdit(null)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">✕</button>
            </div>

            <div>
              <label className={labelCls}>Category Name</label>
              <input className={inputCls} value={edit.name} onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label className={labelCls}>Subcategories</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={editSubInput}
                  onChange={(e) => setEditSubInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(edit, editSubInput, setEdit); setEditSubInput(""); } }}
                  placeholder="Type & press Enter"
                />
                <Button size="sm" type="button" onClick={() => { addSub(edit, editSubInput, setEdit); setEditSubInput(""); }}>+</Button>
              </div>
              {edit.subcategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {edit.subcategories.map((s) => (
                    <span key={s} className="flex items-center gap-1.5 text-[11px] font-bold bg-accent/15 text-accent px-2.5 py-1 rounded-full border border-accent/30">
                      {s}
                      <button type="button" onClick={() => setEdit((f) => ({ ...f, subcategories: f.subcategories.filter((x) => x !== s) }))} className="hover:text-rose-400">✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Button full type="submit" disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}