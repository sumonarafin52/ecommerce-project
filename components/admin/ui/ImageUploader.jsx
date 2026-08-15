// components/admin/ui/ImageUploader.jsx
// Shared image-upload tile, originally written inline in Settings → General
// and promoted here once Billing (invoice logo) needed the exact same
// piece. Uploads through the shared /api/upload endpoint (staff-only).
"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";

export default function ImageUploader({ value, onChange, label = "Image", aspect = "aspect-video" }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (res.success && res.url) onChange(res.url);
      else toast.error(res.message || "Image upload failed");
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="text-xs font-bold admin-text-secondary mb-1.5 block">{label}</span>
      <div
        onClick={() => fileRef.current?.click()}
        className={`${aspect} rounded-lg border-2 border-dashed admin-border hover:border-accent/50 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden relative transition-colors`}
      >
        {value ? (
          <img src={value} alt={label} className="w-full h-full object-contain" />
        ) : (
          <p className="text-xs admin-text-muted px-4 text-center">{uploading ? "Uploading..." : "Click to upload"}</p>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value && (
        <button onClick={() => onChange("")} className="text-[11px] font-bold text-rose-500 hover:underline mt-1">
          Remove image
        </button>
      )}
    </div>
  );
}
