// app/admin/digital/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";

const inputCls =
  "w-full bg-white/5 border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent focus:bg-white/[0.07] transition-all";
const labelCls = "block text-[11px] font-bold text-zinc-300 mb-1.5 uppercase tracking-wider";

const formatBytes = (b) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

const fileStyle = (type) => {
  const t = (type || "").toLowerCase();
  if (t.includes("pdf")) return { bg: "bg-rose-500", label: "PDF" };
  if (t.includes("zip") || t.includes("rar")) return { bg: "bg-amber-500", label: "ZIP" };
  if (t.includes("image")) return { bg: "bg-fuchsia-500", label: "IMG" };
  if (t.includes("audio")) return { bg: "bg-emerald-500", label: "AUD" };
  if (t.includes("video")) return { bg: "bg-blue-500", label: "VID" };
  if (t.includes("epub") || t.includes("text")) return { bg: "bg-violet-500", label: "DOC" };
  return { bg: "bg-zinc-500", label: "FILE" };
};

export default function AdminDigitalPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "" });
  const [file, setFile] = useState(null); // { url, name, size, type }
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const load = () => {
    fetch("/api/digital-products")
      .then((r) => r.json())
      .then((res) => { if (res.success) setItems(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && can("products")) load();
    else setLoading(false);
  }, [status, can]);

  const uploadFile = async (f) => {
    if (!f) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", "digital"); // allow non-image types (ebooks/zips) on the shared upload endpoint
      const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      const url = res.url || res.secure_url || res.data?.url || res.data?.secure_url;
      if (!url) throw new Error(res.message || "File upload failed");
      setFile({ url, name: f.name, size: f.size, type: f.type || f.name.split(".").pop() });
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) return setError("Title is required");
    if (!file) return setError("Please upload a file first");
    setSaving(true);
    try {
      const res = await fetch("/api/digital-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          fileUrl: file.url,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        }),
      }).then((r) => r.json());
      if (res.success) {
        setForm({ title: "", description: "" });
        setFile(null);
        load();
      } else setError(res.message);
    } catch {
      setError("Failed to create digital product");
    }
    setSaving(false);
  };

  const toggleActive = async (d) => {
    await fetch(`/api/digital-products/${d._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !d.active }),
    }).then((r) => r.json());
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this digital product? Products using it will lose the download.")) return;
    await fetch(`/api/digital-products/${id}`, { method: "DELETE" }).then((r) => r.json());
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
            Digital Products
            <span className="bg-cyan-500/15 text-cyan-400 text-xs font-bold px-2.5 py-1 rounded-full">{items.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Downloadable files (PDF, ZIP, courses, software...) — product form e attach kora jabe</p>
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* ===== CREATE CARD ===== */}
          <form onSubmit={create} className="bg-gradient-to-br from-cyan-500/10 via-primary-light to-primary-light border border-white/10 rounded-2xl p-6 space-y-4 lg:sticky lg:top-4">
            <h2 className="text-base font-extrabold text-white flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </span>
              Upload Digital Product
            </h2>

            {error && <p className="text-sm font-bold text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg px-4 py-3">{error}</p>}

            <div>
              <label className={labelCls}>Title *</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Premium Ebook Bundle" />
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <textarea className={`${inputCls} resize-none`} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What will the customer get?" />
            </div>

            <div>
              <label className={labelCls}>File *</label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  file ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/20 hover:border-cyan-400/60 hover:bg-cyan-500/5"
                }`}
              >
                {uploading ? (
                  <p className="text-sm font-bold text-cyan-300">Uploading...</p>
                ) : file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white truncate">{file.name}</p>
                    <p className="text-[11px] text-cyan-300">{formatBytes(file.size)} • {(file.type || "").toUpperCase()}</p>
                    <p className="text-[10px] text-zinc-500">Click to replace</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-zinc-300">Click to choose file</p>
                    <p className="text-[11px] text-zinc-500">PDF, ZIP, EPUB, MP3, MP4...</p>
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>

            <button type="submit" disabled={saving || uploading} className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-extrabold py-3 rounded-lg transition-all disabled:opacity-50 shadow-glow">
              {saving ? "Creating..." : "💾 Create Digital Product"}
            </button>
          </form>

          {/* ===== LIST ===== */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.length === 0 && (
              <div className="col-span-full text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">
                No digital products yet — upload your first file!
              </div>
            )}
            {items.map((d) => {
              const st = fileStyle(d.fileType);
              return (
                <div key={d._id} className={`bg-primary-light border rounded-2xl p-5 space-y-3 transition-colors ${d.active ? "border-white/10 hover:border-cyan-400/60" : "border-white/5 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl ${st.bg} flex items-center justify-center shrink-0 shadow-lg`}>
                      <span className="text-[9px] font-extrabold text-white">{st.label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-white truncate">{d.title}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{d.fileName || "file"} • {formatBytes(d.fileSize)}</p>
                    </div>
                    <button
                      onClick={() => toggleActive(d)}
                      title={d.active ? "Deactivate" : "Activate"}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${d.active ? "bg-emerald-500/60" : "bg-zinc-600"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${d.active ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </div>

                  {d.description && <p className="text-xs text-zinc-400 line-clamp-2">{d.description}</p>}

                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>⬇ {d.downloads} downloads</span>
                    <span>{formatDate(d.createdAt)}</span>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-zinc-300 hover:text-cyan-400 font-bold text-xs border border-white/15 hover:border-cyan-400 rounded-lg px-3 py-2 transition-colors">
                      Open File
                    </a>
                    <button onClick={() => remove(d._id)} className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-lg px-3 py-2 transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}