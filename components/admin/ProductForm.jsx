// components/admin/ProductForm.jsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";
const labelCls = "block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider";
const sectionCls = "bg-primary-light border border-white/10 rounded-xl p-5 space-y-4";

const emptyForm = {
  name: "",
  shortDescription: "",
  description: "",
  category: "",
  subcategory: "",
  brand: "",
  sku: "",
  tags: [],
  price: "",
  discountPrice: "",
  stock: "",
  lowStockThreshold: "5",
  featured: false,
  status: "public",
  images: [],
  options: [],
  combinations: [],
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
      key,
      options: c,
      price: prev?.price || 0,
      comparePrice: prev?.comparePrice || 0,
      sku: prev?.sku || "",
      stock: prev?.stock || 0,
      image: prev?.image || "",
      active: prev?.active !== false,
    };
  });
};

export default function ProductForm({ initial }) {
  const router = useRouter();
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name || "",
          shortDescription: initial.shortDescription || "",
          description: initial.description || "",
          category: initial.category || "",
          subcategory: initial.subcategory || "",
          brand: initial.brand || "",
          sku: initial.sku || "",
          tags: initial.tags || [],
          price: initial.price ?? "",
          discountPrice: initial.discountPrice || "",
          stock: initial.stock ?? "",
          lowStockThreshold: initial.lowStockThreshold ?? "5",
          featured: Boolean(initial.featured),
          status: initial.status || "public",
          images: initial.images || [],
          options: initial.options || [],
          combinations: initial.combinations || [],
        }
      : emptyForm
  );
  const [tagInput, setTagInput] = useState("");
  const [newVariant, setNewVariant] = useState("");
  const [valueInputs, setValueInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // ===== TAGS =====
  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags : [...f.tags, t] }));
    setTagInput("");
  };

  // ===== IMAGE UPLOAD =====
  const uploadFiles = async (files) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
        const url = res.url || res.data?.url || res.secure_url;
        if (url) setForm((f) => ({ ...f, images: [...f.images, url] }));
      }
    } catch {
      setError("Image upload failed");
    }
    setUploading(false);
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

  // ===== VARIANTS =====
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

  // ===== SAVE =====
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

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{error}</p>
      )}

      {/* ===== BASIC INFO ===== */}
      <section className={sectionCls}>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-accent rounded-full" /> Basic Information
        </h2>
        <div>
          <label className={labelCls}>Product Title *</label>
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Wireless Gaming Mouse" />
        </div>
        <div>
          <label className={labelCls}>Short Description</label>
          <textarea className={inputCls} rows={2} value={form.shortDescription} onChange={set("shortDescription")} placeholder="One-line summary for cards (optional)" />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={6} value={form.description} onChange={set("description")} placeholder="Full product details..." />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={set("status")}>
              <option value="public" className="bg-primary">Public — visible everywhere</option>
              <option value="unlisted" className="bg-primary">Unlisted — direct URL only</option>
              <option value="draft" className="bg-primary">Draft — hidden, still preparing</option>
              <option value="private" className="bg-primary">Private — not publicly accessible</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer sm:mt-6">
            <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} className="accent-[#f5a623] w-4 h-4" />
            <span className="text-sm font-bold text-zinc-200">Featured product (homepage e dekhabe)</span>
          </label>
        </div>
      </section>

      {/* ===== MEDIA ===== */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-full" /> Media
          </h2>
          <span className="text-[11px] text-zinc-500">Drag to reorder • First image = primary</span>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-accent bg-accent/10" : "border-white/15 hover:border-accent/60"
          }`}
        >
          <p className="text-sm font-bold text-zinc-300">{uploading ? "Uploading..." : "Drag & drop images here"}</p>
          <p className="text-xs text-zinc-500 mt-1">or click to browse (multiple images supported)</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {form.images.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {form.images.map((img, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) moveImage(dragIndex, i); setDragIndex(null); }}
                className={`relative group rounded-lg border overflow-hidden bg-black/20 cursor-grab ${i === 0 ? "border-accent" : "border-white/10"}`}
              >
                <img src={img} alt={`Product ${i + 1}`} className="w-full aspect-square object-contain" />
                {i === 0 && (
                  <span className="absolute top-1 left-1 bg-accent text-primary text-[9px] font-extrabold px-1.5 py-0.5 rounded">PRIMARY</span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/70 flex justify-center gap-1 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {i !== 0 && (
                    <button type="button" onClick={() => setPrimary(i)} className="text-[10px] font-bold text-accent hover:underline">
                      Set Primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, x) => x !== i) }))}
                    className="text-[10px] font-bold text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== ORGANIZATION ===== */}
      <section className={sectionCls}>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-accent rounded-full" /> Organization
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Category *</label>
            <input className={inputCls} value={form.category} onChange={set("category")} placeholder="e.g. Electronics" />
          </div>
          <div>
            <label className={labelCls}>Subcategory</label>
            <input className={inputCls} value={form.subcategory} onChange={set("subcategory")} placeholder="e.g. Accessories" />
          </div>
          <div>
            <label className={labelCls}>Brand</label>
            <input className={inputCls} value={form.brand} onChange={set("brand")} placeholder="e.g. Logitech" />
          </div>
          <div>
            <label className={labelCls}>SKU</label>
            <input className={inputCls} value={form.sku} onChange={set("sku")} placeholder="e.g. LGT-MX-100" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Tags (SEO)</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Type a tag & press Enter"
            />
            <button type="button" onClick={addTag} className="border border-accent text-accent hover:bg-accent hover:text-primary text-xs font-bold px-4 rounded-md transition-colors">
              Add
            </button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 text-[11px] font-bold bg-accent/15 text-accent px-2 py-1 rounded-full">
                  {t}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} className="hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== PRICING & INVENTORY ===== */}
      <section className={sectionCls}>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-accent rounded-full" /> Pricing & Inventory
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Old Price (৳)</label>
            <input type="number" min="0" className={inputCls} value={form.price} onChange={set("price")} placeholder="1500" />
          </div>
          <div>
            <label className={labelCls}>Selling Price (৳)</label>
            <input type="number" min="0" className={inputCls} value={form.discountPrice} onChange={set("discountPrice")} placeholder="1200 (optional)" />
          </div>
          <div>
            <label className={labelCls}>Stock</label>
            <input type="number" min="0" className={inputCls} value={form.stock} onChange={set("stock")} placeholder="25" />
          </div>
          <div>
            <label className={labelCls}>Low Stock Alert At</label>
            <input type="number" min="0" className={inputCls} value={form.lowStockThreshold} onChange={set("lowStockThreshold")} />
          </div>
        </div>
      </section>

      {/* ===== VARIANTS ===== */}
      <section className={sectionCls}>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-accent rounded-full" /> Variants
        </h2>

        <div className="flex gap-2">
          <input className={inputCls} value={newVariant} onChange={(e) => setNewVariant(e.target.value)} placeholder="Variant type: Size, Color, Material..." />
          <button type="button" onClick={addVariantType} className="border border-accent text-accent hover:bg-accent hover:text-primary text-xs font-bold px-4 rounded-md transition-colors whitespace-nowrap">
            + Add Variant
          </button>
        </div>

        {form.options.map((opt) => (
          <div key={opt.name} className="bg-black/20 border border-white/5 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-accent">{opt.name}</p>
              <button type="button" onClick={() => removeVariantType(opt.name)} className="text-[11px] text-red-400 hover:underline font-bold">
                Remove type
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {opt.values.map((v) => (
                <span key={v} className="flex items-center gap-1 text-[11px] font-bold bg-white/5 text-zinc-200 px-2 py-1 rounded-full">
                  {v}
                  <button type="button" onClick={() => removeVariantValue(opt.name, v)} className="hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={`${inputCls} max-w-[220px]`}
                value={valueInputs[opt.name] || ""}
                onChange={(e) => setValueInputs((s) => ({ ...s, [opt.name]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariantValue(opt.name); } }}
                placeholder={`Add ${opt.name} value + Enter`}
              />
              <button type="button" onClick={() => addVariantValue(opt.name)} className="text-[11px] font-bold text-accent hover:underline">
                Add value
              </button>
            </div>
          </div>
        ))}

        {form.combinations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[640px]">
              <thead>
                <tr className="text-zinc-400 border-b border-white/10">
                  <th className="p-2 font-medium">Variant</th>
                  <th className="p-2 font-medium">Price (৳)</th>
                  <th className="p-2 font-medium">Compare (৳)</th>
                  <th className="p-2 font-medium">SKU</th>
                  <th className="p-2 font-medium">Stock</th>
                  <th className="p-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {form.combinations.map((c, i) => (
                  <tr key={c.key} className="border-b border-white/5">
                    <td className="p-2 font-bold text-white whitespace-nowrap">{c.key}</td>
                    <td className="p-2"><input type="number" min="0" className={`${inputCls} w-24`} value={c.price || ""} onChange={(e) => updateCombo(i, "price", Number(e.target.value))} placeholder="base" /></td>
                    <td className="p-2"><input type="number" min="0" className={`${inputCls} w-24`} value={c.comparePrice || ""} onChange={(e) => updateCombo(i, "comparePrice", Number(e.target.value))} /></td>
                    <td className="p-2"><input className={`${inputCls} w-28`} value={c.sku} onChange={(e) => updateCombo(i, "sku", e.target.value)} /></td>
                    <td className="p-2"><input type="number" min="0" className={`${inputCls} w-20`} value={c.stock} onChange={(e) => updateCombo(i, "stock", Number(e.target.value))} /></td>
                    <td className="p-2"><input type="checkbox" checked={c.active} onChange={(e) => updateCombo(i, "active", e.target.checked)} className="accent-[#f5a623] w-4 h-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-zinc-500 mt-2">{form.combinations.length} combinations auto-generated • Price 0 = base price</p>
          </div>
        )}
      </section>

      {/* ===== SAVE BAR ===== */}
      <div className="flex gap-3 sticky bottom-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50 shadow-glow"
        >
          {saving ? "Saving..." : initial ? "Save Changes" : "Create Product"}
        </button>
        <button
          onClick={() => router.push("/admin/products")}
          className="px-6 border border-white/15 text-zinc-300 hover:border-white/40 font-bold py-3 rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}