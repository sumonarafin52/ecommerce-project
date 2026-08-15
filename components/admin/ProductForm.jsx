// components/admin/ProductForm.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

const inputCls =
  "w-full bg-white/5 border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent focus:bg-white/[0.07] transition-all";
const labelCls = "block text-[11px] font-bold text-zinc-300 mb-1.5 uppercase tracking-wider";

const emptyForm = {
  name: "", shortDescription: "", description: "",
  category: "", subcategory: "", brand: "", sku: "", weight: "",
  tags: [], price: "", discountPrice: "",
  stock: "", lowStockThreshold: "5",
  featured: false, status: "public",
  images: [], options: [], combinations: [],
  digitalProduct: "",
};

const cartesian = (options, existing) => {
  const opts = options.filter((o) => o.name && o.values.length);
  if (!opts.length) return [];
  let combos = [{}];
  for (const o of opts) {
    const next = [];
    for (const c of combos) for (const v of o.values) next.push({ ...c, [o.name]: v });
    combos = next;
  }
  return combos.map((c) => {
    const key = opts.map((o) => c[o.name]).join(" / ");
    const prev = existing.find((x) => x.key === key);
    return {
      key, options: c,
      price: prev?.price || 0, comparePrice: prev?.comparePrice || 0,
      sku: prev?.sku || "", stock: prev?.stock || 0,
      image: prev?.image || "", active: prev?.active !== false,
    };
  });
};

const formatBytes = (b) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

const Section = ({ icon, title, iconBg, tint, children, right }) => (
  <section className={`relative bg-gradient-to-br ${tint} via-primary-light to-primary-light border border-white/10 rounded-2xl p-6 space-y-4`}>
    <div className="flex items-center justify-between">
      <h2 className="text-base font-extrabold text-white flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shadow-lg shrink-0`}>
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </span>
        {title}
      </h2>
      {right}
    </div>
    {children}
  </section>
);

const statusOptions = [
  { key: "public", label: "Public", desc: "Visible on store", iconBg: "bg-emerald-500", border: "border-emerald-400", bg: "bg-emerald-500/10", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  { key: "unlisted", label: "Unlisted", desc: "Direct URL only", iconBg: "bg-zinc-500", border: "border-zinc-400", bg: "bg-zinc-500/10", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { key: "draft", label: "Draft", desc: "Still preparing", iconBg: "bg-blue-500", border: "border-blue-400", bg: "bg-blue-500/10", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
  { key: "private", label: "Private", desc: "Hidden from all", iconBg: "bg-rose-500", border: "border-rose-400", bg: "bg-rose-500/10", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
];

export default function ProductForm({ initial }) {
  const router = useRouter();
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name || "", shortDescription: initial.shortDescription || "",
          description: initial.description || "", category: initial.category || "",
          subcategory: initial.subcategory || "", brand: initial.brand || "", sku: initial.sku || "",
          weight: initial.weight || "",
          tags: initial.tags || [], price: initial.price ?? "",
          discountPrice: initial.discountPrice || "", stock: initial.stock ?? "",
          lowStockThreshold: initial.lowStockThreshold ?? "5",
          featured: Boolean(initial.featured), status: initial.status || "public",
          images: initial.images || [], options: initial.options || [], combinations: initial.combinations || [],
          digitalProduct: initial.digitalProduct?._id || initial.digitalProduct || "",
        }
      : emptyForm
  );
  const [categories, setCategories] = useState([]);
  const [digitalProducts, setDigitalProducts] = useState([]);
  const [showPreview, setShowPreview] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [newVariant, setNewVariant] = useState("");
  const [valueInputs, setValueInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [comboUploadIndex, setComboUploadIndex] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const comboFileRef = useRef(null);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((res) => { if (res.success) setCategories(res.data); }).catch(() => {});
    fetch("/api/digital-products").then((r) => r.json()).then((res) => { if (res.success) setDigitalProducts(res.data); }).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const selectedCategory = categories.find((c) => c.name === form.category);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags : [...f.tags, t] }));
    setTagInput("");
  };

  const uploadFiles = async (files) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      for (let i = 0; i < list.length; i++) {
        const fd = new FormData();
        fd.append("file", list[i]);
        const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
        const url = res.url || res.secure_url || res.data?.url || res.data?.secure_url || res.result?.secure_url;
        if (!url) throw new Error(res.message || "Image upload failed");
        setForm((f) => ({ ...f, images: [...f.images, url] }));
        setUploadProgress(Math.round(((i + 1) / list.length) * 100));
      }
    } catch (err) {
      setError(err.message || "Image upload failed");
    }
    setUploading(false);
    setUploadProgress(0);
  };

  const moveImage = (from, to) => {
    setForm((f) => {
      const images = [...f.images];
      const [item] = images.splice(from, 1);
      images.splice(to, 0, item);
      return { ...f, images };
    });
  };

  const setPrimary = (i) => moveImage(i, 0);

  const uploadComboImage = async (file) => {
    if (!file || comboUploadIndex === null) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
    const url = res.url || res.secure_url || res.data?.url || res.data?.secure_url;
    if (url) {
      setForm((f) => ({
        ...f,
        combinations: f.combinations.map((c, x) => (x === comboUploadIndex ? { ...c, image: url } : c)),
      }));
    } else setError(res.message || "Variant image upload failed");
    setComboUploadIndex(null);
  };

  const addVariantType = () => {
    const name = newVariant.trim();
    if (!name) return;
    setForm((f) => {
      if (f.options.some((o) => o.name.toLowerCase() === name.toLowerCase())) return f;
      const options = [...f.options, { name, values: [] }];
      return { ...f, options, combinations: cartesian(options, f.combinations) };
    });
    setNewVariant("");
  };

  const addVariantValue = (optName) => {
    const val = (valueInputs[optName] || "").trim();
    if (!val) return;
    setForm((f) => {
      const options = f.options.map((o) =>
        o.name === optName && !o.values.includes(val) ? { ...o, values: [...o.values, val] } : o
      );
      return { ...f, options, combinations: cartesian(options, f.combinations) };
    });
    setValueInputs((v) => ({ ...v, [optName]: "" }));
  };

  const removeVariantValue = (optName, val) =>
    setForm((f) => {
      const options = f.options.map((o) =>
        o.name === optName ? { ...o, values: o.values.filter((v) => v !== val) } : o
      );
      return { ...f, options, combinations: cartesian(options, f.combinations) };
    });

  const removeVariantType = (optName) =>
    setForm((f) => {
      const options = f.options.filter((o) => o.name !== optName);
      return { ...f, options, combinations: cartesian(options, f.combinations) };
    });

  const updateCombo = (i, key, val) =>
    setForm((f) => ({
      ...f,
      combinations: f.combinations.map((c, x) => (x === i ? { ...c, [key]: val } : c)),
    }));

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("Product title is required");
    if (!form.category.trim()) return setError("Category is required");
    if (form.price === "" || isNaN(Number(form.price)) || Number(form.price) < 0)
      return setError("Valid price is required");

    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        discountPrice: Number(form.discountPrice) || 0,
        stock: Number(form.stock) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
        weight: Number(form.weight) || 0,
        digitalProduct: form.digitalProduct || null,
      };
      const res = await fetch(initial ? `/api/products/${initial._id}` : "/api/products", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.success) router.push("/admin/products");
      else setError(res.message);
    } catch {
      setError("Failed to save product");
    }
    setSaving(false);
  };

  const canViewLive = initial && (form.status === "public" || form.status === "unlisted");
  const previewDiscount =
    form.price && form.discountPrice && Number(form.discountPrice) < Number(form.price)
      ? Math.round(((Number(form.price) - Number(form.discountPrice)) / Number(form.price)) * 100)
      : 0;
  const attachedDigital = digitalProducts.find((d) => d._id === form.digitalProduct);

  return (
    <div className="space-y-6">
      {/* ===== TOP ACTION BAR: preview toggle + view live ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowPreview((s) => !s)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold border transition-colors ${
            showPreview ? "border-accent bg-accent/15 text-accent" : "border-white/15 text-zinc-300 hover:border-accent hover:text-accent"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {showPreview ? "Hide Preview" : "Show Preview"}
        </button>

        {initial && (
          <a
            href={`/products/${initial._id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={canViewLive ? "Open storefront page in new tab" : "Only public/unlisted products can be viewed"}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold border transition-colors ${
              canViewLive
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-white/10 text-zinc-500 cursor-not-allowed pointer-events-none"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Live Page
          </a>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-bold text-rose-300">{error}</p>
        </div>
      )}

      <div className={`grid gap-6 items-start ${showPreview ? "lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_400px]" : ""}`}>
        {/* ===== LEFT: main content ===== */}
        <div className="space-y-6 min-w-0">
          <Section icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" title="Basic Information" iconBg="bg-accent" tint="from-accent/10">
            <div>
              <label className={labelCls}>Product Title <span className="text-rose-400">*</span></label>
              <input className={`${inputCls} !text-lg !py-3 !font-bold`} value={form.name} onChange={set("name")} placeholder="e.g. Wireless Gaming Mouse Pro" />
            </div>
            <div>
              <label className={labelCls}>Short Description</label>
              <textarea className={`${inputCls} resize-none`} rows={2} maxLength={160} value={form.shortDescription} onChange={set("shortDescription")} placeholder="One-line summary for product cards (optional)" />
              <p className="text-[11px] text-zinc-500 mt-1 text-right">{(form.shortDescription || "").length}/160</p>
            </div>
            <div>
              <label className={labelCls}>Full Description</label>
              <textarea className={`${inputCls} resize-none`} rows={8} value={form.description} onChange={set("description")} placeholder="Detailed product information, features, specifications..." />
            </div>
          </Section>

          <Section icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" title="Media" iconBg="bg-fuchsia-500" tint="from-fuchsia-500/10">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all overflow-hidden ${
                dragOver ? "border-accent bg-accent/10 scale-[1.01]" : "border-white/20 hover:border-fuchsia-400/60 hover:bg-fuchsia-500/5"
              }`}
            >
              {uploading && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5">
                  <div className="h-full bg-gradient-to-r from-accent to-fuchsia-400 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{uploading ? `Uploading... ${uploadProgress}%` : "Drag & drop images here"}</p>
                  <p className="text-xs text-zinc-400 mt-1">or <span className="text-accent underline">click to browse</span> • PNG, JPG, WebP</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
            </div>

            {form.images.length > 0 && (
              <div>
                <p className="text-[11px] text-zinc-400 mb-2">Drag to reorder • First image = main photo</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
                  {form.images.map((img, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) moveImage(dragIndex, i); setDragIndex(null); }}
                      className={`relative group rounded-xl overflow-hidden aspect-square cursor-grab active:cursor-grabbing transition-all ${
                        i === 0 ? "ring-2 ring-accent ring-offset-2 ring-offset-primary-light" : "border border-white/10 hover:border-fuchsia-400/60"
                      }`}
                    >
                      <img src={img} alt={`Product ${i + 1}`} className="w-full h-full object-contain bg-black/40" />
                      {i === 0 && (
                        <span className="absolute top-1.5 left-1.5 bg-gradient-to-r from-accent to-orange-500 text-primary text-[9px] font-extrabold px-2 py-1 rounded-md shadow-lg uppercase tracking-wider">Main</span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                        {i !== 0 && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setPrimary(i); }} className="text-[10px] font-bold text-accent hover:bg-accent/20 rounded px-1.5 py-1 transition-colors">★ Set as main</button>
                        )}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setForm((f) => ({ ...f, images: f.images.filter((_, x) => x !== i) })); }} className="text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 rounded px-1.5 py-1 transition-colors">✕ Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" title="Pricing" iconBg="bg-emerald-500" tint="from-emerald-500/10">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Compare at price (old) <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">৳</span>
                  <input type="number" min="0" className={`${inputCls} !pl-7`} value={form.price} onChange={set("price")} placeholder="1500" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Selling price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">৳</span>
                  <input type="number" min="0" className={`${inputCls} !pl-7`} value={form.discountPrice} onChange={set("discountPrice")} placeholder="1200 (optional)" />
                </div>
              </div>
            </div>
            {previewDiscount > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
                <span className="text-xs font-bold text-emerald-400">🎯 Customers save {previewDiscount}% ({formatCurrency(Number(form.price) - Number(form.discountPrice))})</span>
              </div>
            )}
          </Section>

          <Section icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" title="Variants & Digital Delivery" iconBg="bg-violet-500" tint="from-violet-500/10"
            right={form.combinations.length > 0 && (
              <span className="text-[11px] font-bold bg-violet-500/15 text-violet-300 px-2.5 py-1 rounded-full border border-violet-500/30">{form.combinations.length} combinations</span>
            )}
          >
            <div className="flex gap-2">
              <input className={inputCls} value={newVariant} onChange={(e) => setNewVariant(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariantType(); } }} placeholder="Add variant type: Size, Color, Material..." />
              <button type="button" onClick={addVariantType} className="bg-gradient-to-r from-accent to-orange-500 hover:from-accent/90 hover:to-orange-500/90 text-primary text-xs font-extrabold px-4 rounded-lg transition-all shadow-glow whitespace-nowrap">+ Add Type</button>
            </div>

            {form.options.length > 0 && (
              <div className="space-y-3">
                {form.options.map((opt) => (
                  <div key={opt.name} className="bg-gradient-to-br from-violet-500/10 to-primary border border-violet-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-extrabold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-violet-500 flex items-center justify-center text-[11px]">{opt.name.charAt(0).toUpperCase()}</span>
                        {opt.name}
                      </p>
                      <button type="button" onClick={() => removeVariantType(opt.name)} className="text-[11px] text-rose-400 hover:text-rose-300 font-bold hover:bg-rose-500/10 px-2 py-1 rounded transition-colors">Remove type</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {opt.values.map((v) => (
                        <span key={v} className="flex items-center gap-1.5 text-[11px] font-bold bg-white/10 text-white px-2.5 py-1 rounded-full border border-white/10">
                          {v}
                          <button type="button" onClick={() => removeVariantValue(opt.name, v)} className="hover:text-rose-400">✕</button>
                        </span>
                      ))}
                      {opt.values.length === 0 && <span className="text-[11px] text-zinc-500 italic">No values yet — add some below</span>}
                    </div>
                    <input className={inputCls} value={valueInputs[opt.name] || ""} onChange={(e) => setValueInputs((s) => ({ ...s, [opt.name]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariantValue(opt.name); } }} placeholder={`Add ${opt.name} value + Enter`} />
                  </div>
                ))}
              </div>
            )}

            {form.combinations.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs text-left min-w-[760px]">
                  <thead>
                    <tr className="text-zinc-400 bg-black/20 border-b border-white/10">
                      <th className="p-3 font-bold">Variant</th>
                      <th className="p-3 font-bold">Photo</th>
                      <th className="p-3 font-bold">Price (৳)</th>
                      <th className="p-3 font-bold">SKU</th>
                      <th className="p-3 font-bold">Stock</th>
                      <th className="p-3 font-bold">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.combinations.map((c, i) => (
                      <tr key={c.key} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                        <td className="p-3 font-bold text-white whitespace-nowrap">{c.key}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-md bg-black/30 border border-white/10 overflow-hidden shrink-0">
                              {c.image ? <img src={c.image} alt={c.key} className="w-full h-full object-contain" /> : <span className="text-zinc-600 text-[8px] flex items-center justify-center h-full">—</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => { setComboUploadIndex(i); comboFileRef.current?.click(); }}
                              className="text-[10px] font-bold text-violet-300 hover:text-violet-200 border border-violet-500/30 hover:border-violet-400 rounded px-2 py-1 transition-colors whitespace-nowrap"
                            >
                              {c.image ? "Change" : "Upload"}
                            </button>
                          </div>
                        </td>
                        <td className="p-3"><input type="number" min="0" className={`${inputCls} !w-24 !py-1.5`} value={c.price || ""} onChange={(e) => updateCombo(i, "price", Number(e.target.value))} placeholder="base" /></td>
                        <td className="p-3"><input className={`${inputCls} !w-28 !py-1.5`} value={c.sku} onChange={(e) => updateCombo(i, "sku", e.target.value)} /></td>
                        <td className="p-3"><input type="number" min="0" className={`${inputCls} !w-20 !py-1.5`} value={c.stock} onChange={(e) => updateCombo(i, "stock", Number(e.target.value))} /></td>
                        <td className="p-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={c.active} onChange={(e) => updateCombo(i, "active", e.target.checked)} className="sr-only peer" />
                            <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <input ref={comboFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { uploadComboImage(e.target.files?.[0]); e.target.value = ""; }} />
                <p className="text-[11px] text-zinc-500 p-3 bg-black/10 border-t border-white/5">💡 Price 0 = base price • Photo upload korle storefront e variant select er somoy oi photo dekhabe</p>
              </div>
            )}

            {/* ===== DIGITAL PRODUCT ATTACH ===== */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-primary border border-cyan-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-extrabold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </span>
                Digital Delivery (optional)
              </p>
              <select className={inputCls} value={form.digitalProduct} onChange={set("digitalProduct")}>
                <option value="" className="bg-primary">No digital product (physical only)</option>
                {digitalProducts.filter((d) => d.active).map((d) => (
                  <option key={d._id} value={d._id} className="bg-primary">
                    {d.title} ({d.fileType || "file"} • {formatBytes(d.fileSize)})
                  </option>
                ))}
              </select>
              {attachedDigital && (
                <p className="text-[11px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-md px-3 py-2">
                  ⚡ Customer payment er por <b>{attachedDigital.title}</b> download korte parbe
                </p>
              )}
              <p className="text-[11px] text-zinc-500">Digital product manage korte sidebar e <b>Products → Digital Products</b> e jan</p>
            </div>
          </Section>
        </div>

        {/* ===== RIGHT: sticky sidebar ===== */}
        <div className="space-y-6 lg:sticky lg:top-4">
          {/* ===== LIVE PREVIEW ===== */}
          {showPreview && (
            <Section icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z" title="Live Preview" iconBg="bg-fuchsia-500" tint="from-fuchsia-500/10">
              <div className="bg-primary border border-white/10 rounded-xl overflow-hidden">
                <div className="relative aspect-square bg-black/30">
                  {form.images[0] ? (
                    <img src={form.images[0]} alt={form.name || "Preview"} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No image</div>
                  )}
                  {previewDiscount > 0 && (
                    <span className="absolute top-2 left-2 bg-accent text-primary text-[10px] font-extrabold px-2 py-1 rounded-full">-{previewDiscount}%</span>
                  )}
                  {form.status !== "public" && (
                    <span className="absolute top-2 right-2 bg-black/70 text-white text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full border border-white/20">{form.status}</span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-accent font-bold">{form.category || "Category"}</p>
                  <p className="text-sm font-bold text-white line-clamp-1">{form.name || "Product title"}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-extrabold text-accent">{formatCurrency(Number(form.discountPrice) || Number(form.price) || 0)}</span>
                    {previewDiscount > 0 && <span className="text-[11px] text-zinc-500 line-through">{formatCurrency(Number(form.price))}</span>}
                  </div>
                  <p className={`text-[10px] font-bold ${Number(form.stock) <= 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {form.stock === "" ? "Stock not set" : Number(form.stock) <= 0 ? "Out of stock" : `In stock (${form.stock})`}
                  </p>
                </div>
              </div>
            </Section>
          )}

          <Section icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z" title="Status" iconBg="bg-emerald-500" tint="from-emerald-500/10"
            right={form.featured && <span className="text-[10px] font-extrabold bg-gradient-to-r from-accent to-orange-500 text-primary px-2 py-1 rounded-md">⭐ FEATURED</span>}
          >
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((s) => (
                <button key={s.key} type="button" onClick={() => setForm((f) => ({ ...f, status: s.key }))}
                  className={`relative p-3 rounded-xl border-2 text-left transition-all ${form.status === s.key ? `${s.border} ${s.bg} shadow-glow` : "border-white/10 hover:border-white/30 bg-white/[0.02]"}`}>
                  <div className={`w-7 h-7 rounded-md ${s.iconBg} flex items-center justify-center mb-2`}>
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                    </svg>
                  </div>
                  <p className="text-xs font-extrabold text-white">{s.label}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 pt-2 cursor-pointer group">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} className="accent-[#f5a623] w-4 h-4" />
              <div>
                <p className="text-xs font-bold text-white group-hover:text-accent transition-colors">Show on homepage</p>
                <p className="text-[10px] text-zinc-500">Feature this product on the store front</p>
              </div>
            </label>
          </Section>

          <Section icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" title="Organization" iconBg="bg-sky-500" tint="from-sky-500/10">
            <div>
              <label className={labelCls}>Category <span className="text-rose-400">*</span></label>
              <select className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: "" }))}>
                <option value="" className="bg-primary">Select category...</option>
                {form.category && !categories.some((c) => c.name === form.category) && (
                  <option value={form.category} className="bg-primary">{form.category}</option>
                )}
                {categories.map((c) => (
                  <option key={c._id} value={c.name} className="bg-primary">{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Subcategory</label>
              <select className={inputCls} value={form.subcategory} onChange={set("subcategory")} disabled={!selectedCategory?.subcategories?.length}>
                <option value="" className="bg-primary">{selectedCategory ? "Select subcategory..." : "Select category first"}</option>
                {form.subcategory && !(selectedCategory?.subcategories || []).includes(form.subcategory) && (
                  <option value={form.subcategory} className="bg-primary">{form.subcategory}</option>
                )}
                {(selectedCategory?.subcategories || []).map((s) => (
                  <option key={s} value={s} className="bg-primary">{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input className={inputCls} value={form.brand} onChange={set("brand")} placeholder="e.g. Logitech" />
            </div>
            <div>
              <label className={labelCls}>SKU</label>
              <input className={inputCls} value={form.sku} onChange={set("sku")} placeholder="Auto: SA-SKU-1, SA-SKU-2..." />
              <p className="text-[11px] text-zinc-500 mt-1">Faka rakhle automatic unique SKU generate hobe</p>
            </div>
            <div>
              <label className={labelCls}>Weight (kg)</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.weight} onChange={set("weight")} placeholder="0.5" />
              <p className="text-[11px] text-zinc-500 mt-1">Used for weight-based shipping rates (Settings → Shipping)</p>
            </div>
          </Section>

          <Section icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" title="Inventory" iconBg="bg-amber-500" tint="from-amber-500/10">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Stock</label>
                <input type="number" min="0" className={inputCls} value={form.stock} onChange={set("stock")} placeholder="25" />
              </div>
              <div>
                <label className={labelCls}>Low alert at</label>
                <input type="number" min="0" className={inputCls} value={form.lowStockThreshold} onChange={set("lowStockThreshold")} />
              </div>
            </div>
            {form.stock !== "" && Number(form.stock) > 0 && Number(form.stock) <= Number(form.lowStockThreshold || 5) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"><span className="text-[11px] font-bold text-amber-400">⚠️ Low stock warning</span></div>
            )}
            {form.stock !== "" && Number(form.stock) <= 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"><span className="text-[11px] font-bold text-rose-400">🚫 Out of stock</span></div>
            )}
          </Section>

          <Section icon="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" title="SEO & Tags" iconBg="bg-pink-500" tint="from-pink-500/10">
            <div className="flex gap-2">
              <input className={inputCls} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Type & press Enter" />
              <button type="button" onClick={addTag} className="bg-pink-500 hover:bg-pink-400 text-white text-xs font-extrabold px-4 rounded-lg transition-colors">+</button>
            </div>
            {form.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-[11px] font-bold bg-gradient-to-r from-pink-500/20 to-accent/20 text-white px-2.5 py-1 rounded-full border border-white/10">
                    #{t}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} className="hover:text-rose-400">✕</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">No tags added yet</p>
            )}
          </Section>
        </div>
      </div>

      {/* ===== STICKY SAVE BAR ===== */}
      <div className="sticky bottom-0 py-4 bg-gradient-to-t from-primary via-primary to-primary/95 border-t border-white/10 backdrop-blur-sm z-20">
        <div className="flex gap-3 items-center justify-between">
          <div className="text-xs text-zinc-400 hidden sm:block">
            {initial ? <span>Editing: <span className="font-bold text-white">{initial.name}</span></span> : <span>Creating a new product</span>}
          </div>
          <div className="flex gap-3 flex-1 sm:flex-none justify-end">
            <button onClick={() => router.push("/admin/products")} className="px-6 border border-white/15 text-zinc-300 hover:border-white/40 hover:bg-white/5 font-bold py-2.5 rounded-lg transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="bg-gradient-to-r from-accent to-orange-500 hover:from-accent/90 hover:to-orange-500/90 text-primary font-extrabold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50 shadow-glow min-w-[160px]">
              {saving ? "Saving..." : initial ? "✓ Save Changes" : "✨ Create Product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}