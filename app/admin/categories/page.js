// app/admin/categories/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";

const inputCls =
  "w-full bg-white/5 border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent focus:bg-white/[0.07] transition-all";
const labelCls = "block text-[11px] font-bold text-zinc-300 mb-1.5 uppercase tracking-wider";

const emptyForm = { name: "", subcategories: [], image: "" };

export default function AdminCategoriesPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [subInput, setSubInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [edit, setEdit] = useState(null);
  const [editSubInput, setEditSubInput] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fileRef = useRef(null);

  const load = () => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((res) => { if (res.success) setCategories(res.data); })
      .catch(() => {})
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

  if (!session || !can("products")) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access denied</p>
        <Link href="/" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Categories
            <span className="bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 rounded-full">{categories.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Category + subcategory gulo product form er dropdown e dekhabe</p>
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* ===== CREATE CARD ===== */}
          <form onSubmit={create} className="bg-gradient-to-br from-accent/10 via-primary-light to-primary-light border border-white/10 rounded-2xl p-6 space-y-4 lg:sticky lg:top-4">
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
                <button type="button" onClick={() => { addSub(form, subInput, setForm); setSubInput(""); }} className="bg-accent hover:bg-accent/80 text-primary text-xs font-extrabold px-4 rounded-lg transition-colors">+</button>
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

            <button type="submit" disabled={saving} className="w-full bg-gradient-to-r from-accent to-orange-500 hover:from-accent/90 hover:to-orange-500/90 text-primary font-extrabold py-3 rounded-lg transition-all disabled:opacity-50 shadow-glow">
              {saving ? "Creating..." : "✨ Create Category"}
            </button>
          </form>

          {/* ===== LIST ===== */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {categories.length === 0 && (
              <div className="col-span-full text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">No categories yet — create your first one!</div>
            )}
            {categories.map((c) => (
              <div key={c._id} className="bg-primary-light border border-white/10 hover:border-accent/60 rounded-2xl p-5 space-y-3 transition-colors">
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
                <button type="button" onClick={() => { addSub(edit, editSubInput, setEdit); setEditSubInput(""); }} className="bg-accent hover:bg-accent/80 text-primary text-xs font-extrabold px-4 rounded-lg transition-colors">+</button>
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

            <button type="submit" disabled={editSaving} className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
              {editSaving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}