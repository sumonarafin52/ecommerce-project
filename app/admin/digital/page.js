// app/admin/digital/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";
import Icon from "@/components/ui/Icon";
import Checkbox from "@/components/admin/ui/Checkbox";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const inputCls = "admin-input w-full";
const labelCls = "block text-[11px] font-bold text-zinc-300 mb-1.5 uppercase tracking-wider";

const formatBytes = (b) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

// File-type tile colours.
//
// These were seven 500-level fills with white text on them, and six of the
// seven were unreadable: white on amber-500 measured 2.15:1, on emerald
// 2.5:1, on fuchsia 3.5:1, on blue 3.68:1, on rose 3.67:1, on violet 4.0:1.
// A soft fill with dark text of the same hue is the pattern every other
// chip in the admin already uses (components/admin/ui/Badge.jsx), and it
// keeps the types just as distinguishable.
const fileStyle = (type) => {
  const t = (type || "").toLowerCase();
  if (t.includes("pdf")) return { bg: "bg-[#FEDAD9] text-[#8E0B21]", label: "PDF" };
  if (t.includes("zip") || t.includes("rar")) return { bg: "bg-[#FFEF9D] text-[#4F4700]", label: "ZIP" };
  if (t.includes("image")) return { bg: "bg-[#FBE0F5] text-[#7A1360]", label: "IMG" };
  if (t.includes("audio")) return { bg: "bg-[#CDFEE1] text-[#0C5132]", label: "AUD" };
  if (t.includes("video")) return { bg: "bg-[#E0F0FF] text-[#00527C]", label: "VID" };
  if (t.includes("epub") || t.includes("text")) return { bg: "bg-[#E8E3FD] text-[#3B217F]", label: "DOC" };
  return { bg: "bg-[#E3E3E3] text-[#4A4A4A]", label: "FILE" };
};

// Files can live in files[] (current) or in the legacy single fileUrl —
// count whichever this document actually uses.
function fileCount(d) {
  if (Array.isArray(d.files) && d.files.length) return d.files.length;
  return d.fileUrl ? 1 : 0;
}

// The name/size to show on the card. A multi-file product leaves the legacy
// fileName/fileSize empty, which rendered a meaningless "file • —".
function primaryFile(d) {
  if (Array.isArray(d.files) && d.files.length) {
    const main = d.files.find((f) => !f.isPreview) || d.files[0];
    return { name: main.name || d.title, size: main.size || 0, type: main.type || "" };
  }
  return { name: d.fileName || "file", size: d.fileSize || 0, type: d.fileType || "" };
}

export default function AdminDigitalPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  const [loadError, setLoadError] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    version: "",
    // 0 means unlimited / never expires — shown as such, never as "0 left"
    downloadLimit: 0,
    downloadExpiryDays: 0,
    licenseMode: "none",
    licenseKey: "",
    licenseTerms: "",
  });
  // Multiple files per product: the main download plus extras (source
  // bundle, sample chapter). files[0] also populates the legacy single-file
  // fields so older code paths keep working.
  const [files, setFiles] = useState([]); // [{ url, name, size, type, label, isPreview }]
  const [policyFor, setPolicyFor] = useState(null); // existing item being edited
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const load = () => {
    setLoadError(false);
    fetch("/api/digital-products")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setItems(res.data);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
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
      setFiles((prev) => [
        ...prev,
        {
          url,
          name: f.name,
          size: f.size,
          type: f.type || f.name.split(".").pop(),
          label: prev.length === 0 ? "Main download" : "",
          isPreview: false,
        },
      ]);
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) return setError("Title is required");
    if (!files.length) return setError("Please upload at least one file");
    if (form.licenseMode === "shared" && !form.licenseKey.trim()) {
      return setError("A shared licence needs a licence key");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/digital-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          version: form.version,
          files,
          // first file mirrored into the legacy fields
          fileUrl: files[0].url,
          fileName: files[0].name,
          fileSize: files[0].size,
          fileType: files[0].type,
          downloadLimit: form.downloadLimit,
          downloadExpiryDays: form.downloadExpiryDays,
          licenseMode: form.licenseMode,
          licenseKey: form.licenseKey,
          licenseTerms: form.licenseTerms,
        }),
      }).then((r) => r.json());
      if (res.success) {
        setForm({
          title: "",
          description: "",
          version: "",
          downloadLimit: 0,
          downloadExpiryDays: 0,
          licenseMode: "none",
          licenseKey: "",
          licenseTerms: "",
        });
        setFiles([]);
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

  // Only the fields shown in the modal are sent, so saving the policy can't
  // blank the file list or the description (the API treats a PUT as a
  // partial update for exactly this reason).
  const savePolicy = async (patch) => {
    setError("");
    const res = await fetch(`/api/digital-products/${policyFor._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    if (res.success) {
      setPolicyFor(null);
      load();
    } else {
      setError(res.message || "Could not save");
    }
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
    return <ErrorState what="digital products" onRetry={() => { setLoadError(false); load(); }} />;
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Digital Products
            <span className="bg-cyan-500/15 text-cyan-400 text-xs font-bold px-2.5 py-1 rounded-full">{items.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Downloadable files (PDF, ZIP, courses, software). Attach one to a product from the product form.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* ===== CREATE CARD ===== */}
          <form onSubmit={create} className="admin-card rounded-2xl p-6 space-y-4 lg:sticky lg:top-4">
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
              <label className={labelCls}>Files *</label>
              {files.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{f.name}</p>
                          <p className="text-[10px] text-zinc-500">
                            {formatBytes(f.size)} • {(f.type || "").toUpperCase()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-rose-400 hover:text-rose-300 text-[11px] font-bold shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <input
                          value={f.label}
                          onChange={(e) =>
                            setFiles((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                          }
                          placeholder="Label (e.g. Source files)"
                          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none"
                        />
                        {/* A preview file is free to anyone and never counts
                            against a buyer's download quota. */}
                        <Checkbox
                          compact
                          className="shrink-0"
                          label="Free preview"
                          checked={f.isPreview}
                          onChange={(on) =>
                            setFiles((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, isPreview: on } : x))
                            )
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  files.length ? "border-cyan-400/40 bg-cyan-500/5" : "border-white/20 hover:border-cyan-400/60 hover:bg-cyan-500/5"
                }`}
              >
                {uploading ? (
                  <p className="text-sm font-bold text-cyan-300">Uploading...</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-zinc-300">
                      {files.length ? "+ Add another file" : "Click to choose file"}
                    </p>
                    <p className="text-[11px] text-zinc-500">PDF, ZIP, EPUB, DOCX, XLSX...</p>
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Version</label>
                <input
                  className={inputCls}
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1.0"
                />
              </div>
              <div>
                <label className={labelCls}>Download limit</label>
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  value={form.downloadLimit}
                  onChange={(e) => setForm((f) => ({ ...f, downloadLimit: e.target.value }))}
                  placeholder="0"
                />
                <p className="text-[10px] text-zinc-500 mt-1">0 = unlimited</p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Access expires after (days)</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.downloadExpiryDays}
                onChange={(e) => setForm((f) => ({ ...f, downloadExpiryDays: e.target.value }))}
                placeholder="0"
              />
              <p className="text-[10px] text-zinc-500 mt-1">0 = never expires. Counted from the purchase date.</p>
            </div>

            <div>
              <label className={labelCls}>Licence</label>
              <select
                className={inputCls}
                value={form.licenseMode}
                onChange={(e) => setForm((f) => ({ ...f, licenseMode: e.target.value }))}
              >
                <option value="none">No licence key</option>
                <option value="generated">Unique key per buyer</option>
                <option value="shared">One shared key</option>
              </select>
              {form.licenseMode === "shared" && (
                <input
                  className={`${inputCls} mt-2`}
                  value={form.licenseKey}
                  onChange={(e) => setForm((f) => ({ ...f, licenseKey: e.target.value }))}
                  placeholder="Shared licence key"
                />
              )}
              {form.licenseMode !== "none" && (
                <textarea
                  className={`${inputCls} resize-none mt-2`}
                  rows={2}
                  value={form.licenseTerms}
                  onChange={(e) => setForm((f) => ({ ...f, licenseTerms: e.target.value }))}
                  placeholder="Licence terms shown to the buyer (e.g. Personal use only)"
                />
              )}
            </div>

            <Button type="submit" full disabled={saving || uploading}>
              {saving ? "Creating…" : "Create digital product"}
            </Button>
          </form>

          {/* ===== LIST ===== */}
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {items.length === 0 && (
              <div className="col-span-full text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">
                No digital products yet — upload your first file!
              </div>
            )}
            {items.map((d) => {
              const st = fileStyle(primaryFile(d).type);
              return (
                <div key={d._id} className={`bg-primary-light border rounded-2xl p-5 space-y-3 transition-colors ${d.active ? "border-white/10 hover:border-cyan-400/60" : "border-white/5 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl ${st.bg} flex items-center justify-center shrink-0 shadow-lg`}>
                      <span className="text-[9px] font-extrabold">{st.label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-white truncate">{d.title}</p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {primaryFile(d).name}
                        {primaryFile(d).size ? ` • ${formatBytes(primaryFile(d).size)}` : ""}
                      </p>
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

                  {/* The delivery policy in force for new purchases. Buyers
                      keep whatever policy applied on the day they bought. */}
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                      {fileCount(d)} file{fileCount(d) === 1 ? "" : "s"}
                    </span>
                    {d.version && <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5">v{d.version}</span>}
                    <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                      {d.downloadLimit > 0 ? `${d.downloadLimit} downloads` : "Unlimited"}
                    </span>
                    <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                      {d.downloadExpiryDays > 0 ? `${d.downloadExpiryDays}-day access` : "No expiry"}
                    </span>
                    {d.licenseMode && d.licenseMode !== "none" && (
                      <span className="bg-violet-100 text-violet-800 rounded px-2 py-0.5">
                        {d.licenseMode === "generated" ? "Unique licence" : "Shared licence"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{d.downloads} downloads</span>
                    <span>{formatDate(d.createdAt)}</span>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setPolicyFor(d)}
                      className="flex-1 text-center text-zinc-300 hover:text-cyan-400 font-bold text-xs border border-white/15 hover:border-cyan-400 rounded-lg px-3 py-2 transition-colors"
                    >
                      Edit policy
                    </button>
                    <button onClick={() => remove(d._id)} className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-lg px-3 py-2 transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {policyFor && <PolicyModal item={policyFor} onClose={() => setPolicyFor(null)} onSave={savePolicy} error={error} />}
      </div>
    </div>
  );
}
// Edits the delivery policy of an existing digital product. Deliberately a
// small focused modal rather than a page — it's four fields, and the
// surrounding list is the useful context.
//
// Changing these affects FUTURE purchases only. Everyone who already bought
// keeps the limit and expiry frozen on their own DownloadGrant, so tightening
// a limit can never retroactively cut off a paying customer.
function PolicyModal({ item, onClose, onSave, error }) {
  const [draft, setDraft] = useState({
    version: item.version || "",
    downloadLimit: item.downloadLimit || 0,
    downloadExpiryDays: item.downloadExpiryDays || 0,
    licenseMode: item.licenseMode || "none",
    licenseKey: item.licenseKey || "",
    licenseTerms: item.licenseTerms || "",
    changeNotes: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const patch = {
      version: draft.version,
      downloadLimit: draft.downloadLimit,
      downloadExpiryDays: draft.downloadExpiryDays,
      licenseMode: draft.licenseMode,
      licenseKey: draft.licenseKey,
      licenseTerms: draft.licenseTerms,
    };
    // Bumping the version with notes appends a changelog entry buyers can
    // read, rather than silently replacing the version string.
    if (draft.changeNotes.trim() && draft.version && draft.version !== item.version) {
      patch.changelog = [
        ...(item.changelog || []),
        { version: draft.version, notes: draft.changeNotes.trim(), at: new Date().toISOString() },
      ];
    }
    await onSave(patch);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit delivery policy"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="admin-card w-full max-w-md space-y-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div>
          <h3 className="text-base font-extrabold text-white">Delivery policy</h3>
          <p className="mt-0.5 text-xs text-zinc-500 truncate">{item.title}</p>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
            {error}
          </p>
        )}

        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          Applies to new purchases only. Existing customers keep the limit and expiry from when they bought.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Version</label>
            <input className={inputCls} value={draft.version} onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))} placeholder="1.1" />
          </div>
          <div>
            <label className={labelCls}>Download limit</label>
            <input type="number" min="0" className={inputCls} value={draft.downloadLimit} onChange={(e) => setDraft((d) => ({ ...d, downloadLimit: e.target.value }))} />
            <p className="mt-1 text-[10px] text-zinc-500">0 = unlimited</p>
          </div>
        </div>

        <div>
          <label className={labelCls}>Access expires after (days)</label>
          <input type="number" min="0" className={inputCls} value={draft.downloadExpiryDays} onChange={(e) => setDraft((d) => ({ ...d, downloadExpiryDays: e.target.value }))} />
          <p className="mt-1 text-[10px] text-zinc-500">0 = never expires</p>
        </div>

        <div>
          <label className={labelCls}>Licence</label>
          <select className={inputCls} value={draft.licenseMode} onChange={(e) => setDraft((d) => ({ ...d, licenseMode: e.target.value }))}>
            <option value="none">No licence key</option>
            <option value="generated">Unique key per buyer</option>
            <option value="shared">One shared key</option>
          </select>
          {draft.licenseMode === "shared" && (
            <input className={`${inputCls} mt-2`} value={draft.licenseKey} onChange={(e) => setDraft((d) => ({ ...d, licenseKey: e.target.value }))} placeholder="Shared licence key" />
          )}
          {draft.licenseMode !== "none" && (
            <textarea className={`${inputCls} resize-none mt-2`} rows={2} value={draft.licenseTerms} onChange={(e) => setDraft((d) => ({ ...d, licenseTerms: e.target.value }))} placeholder="Licence terms shown to the buyer" />
          )}
        </div>

        {draft.version && draft.version !== item.version && (
          <div>
            <label className={labelCls}>What changed in v{draft.version}?</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={draft.changeNotes} onChange={(e) => setDraft((d) => ({ ...d, changeNotes: e.target.value }))} placeholder="Buyers see this in their version history" />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-xs font-bold text-zinc-300 transition-colors hover:bg-white/5">
            Cancel
          </button>
          <Button type="submit" size="sm" className="flex-1" disabled={saving}>
            {saving ? "Saving..." : "Save policy"}
          </Button>
        </div>
      </form>
    </div>
  );
}
