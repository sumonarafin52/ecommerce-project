// app/admin/products/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import ProductTable from "@/components/admin/ProductTable";

const inputCls =
  "w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

const emptyForm = {
  name: "",
  description: "",
  price: "",
  discountPrice: "",
  category: "",
  stock: "",
  images: [],
};

export default function AdminProductsPage() {
  const { data: session, status } = useSession();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = session?.user?.role === "admin";

  const load = () => {
    fetch("/api/products?limit=100")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProducts(res.data.products);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && isAdmin) load();
    else setLoading(false);
  }, [status, isAdmin]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const uploadImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(
        files.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
          const res = await fetch(
            `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
            { method: "POST", body: fd }
          ).then((r) => r.json());
          return res.secure_url;
        })
      );
      setForm((f) => ({ ...f, images: [...f.images, ...urls.filter(Boolean)] }));
    } catch {}
    setUploading(false);
    e.target.value = "";
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (p) => {
    setForm({
      name: p.name,
      description: p.description || "",
      price: String(p.price),
      discountPrice: p.discountPrice ? String(p.discountPrice) : "",
      category: p.category,
      stock: String(p.stock),
      images: p.images || [],
    });
    setEditingId(p._id);
    setError("");
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      discountPrice: Number(form.discountPrice || 0),
      category: form.category,
      stock: Number(form.stock || 0),
      images: form.images,
    };
    try {
      const res = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.success) load();
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Manage Products</h1>
          <button
            onClick={openAdd}
            className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 py-2 rounded-md text-sm transition-colors"
          >
            + Add Product
          </button>
        </div>

        <ProductTable products={products} onEdit={openEdit} onDelete={remove} />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="w-full max-w-lg bg-primary-light border border-white/10 rounded-xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? "Edit Product" : "Add Product"}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-zinc-400 hover:text-white text-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {error && (
              <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">
                {error}
              </p>
            )}

            <input className={inputCls} placeholder="Product name *" required value={form.name} onChange={set("name")} />
            <textarea className={inputCls} placeholder="Description" rows={3} value={form.description} onChange={set("description")} />

            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} type="number" min="0" placeholder="Price (৳) *" required value={form.price} onChange={set("price")} />
              <input className={inputCls} type="number" min="0" placeholder="Discount price (৳)" value={form.discountPrice} onChange={set("discountPrice")} />
              <input className={inputCls} placeholder="Category *" required value={form.category} onChange={set("category")} />
              <input className={inputCls} type="number" min="0" placeholder="Stock" value={form.stock} onChange={set("stock")} />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-400">Images</p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={uploadImages}
                className="block w-full text-sm text-zinc-300 file:mr-3 file:px-4 file:py-2 file:rounded-md file:border-0 file:bg-accent file:text-primary file:font-bold file:text-sm file:cursor-pointer"
              />
              {uploading && <p className="text-xs text-accent">Uploading...</p>}
              {form.images.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {form.images.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img} alt={`upload ${i + 1}`} className="w-16 h-16 object-contain bg-black/30 rounded-md" />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, x) => x !== i) }))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold"
                        aria-label="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving || uploading}
              className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Product" : "Create Product"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}