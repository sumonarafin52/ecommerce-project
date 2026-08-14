// app/admin/settings/general/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Tabs from "@/components/admin/ui/Tabs";
import Badge from "@/components/admin/ui/Badge";
import usePermissions from "@/lib/usePermissions";

const TABS = [
  { key: "store", label: "Store Info" },
  { key: "hero", label: "Hero Slider" },
  { key: "banners", label: "Banners" },
  { key: "sections", label: "Homepage Sections" },
];

const SECTION_TYPES = [
  { value: "newArrivals", label: "New Arrivals (auto)" },
  { value: "topSelling", label: "Top Selling (auto)" },
  { value: "deals", label: "Deals / Discounted (auto)" },
  { value: "underPrice", label: "Under a max price (auto)" },
  { value: "category", label: "Specific category" },
  { value: "manual", label: "Manually picked products" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---- small shared bits (kept local to this page for now; promote to
// components/admin/ui if reused by Payment/Billing/Shipping later) ----

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-bold admin-text-secondary mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="text-[11px] admin-text-muted mt-1 block">{hint}</span>}
    </label>
  );
}

function Input(props) {
  return <input {...props} className={`admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none ${props.className || ""}`} />;
}

function Textarea(props) {
  return <textarea {...props} className={`admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-y ${props.className || ""}`} />;
}

function SaveBar({ dirty, saving, onSave, onDiscard }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6">
      <div className="admin-card rounded-xl px-4 py-3 flex items-center justify-between shadow-lg">
        <p className="text-sm font-bold admin-text-primary">You have unsaved changes</p>
        <div className="flex items-center gap-2">
          <button onClick={onDiscard} className="px-4 py-2 rounded-lg text-sm font-bold admin-text-secondary hover:bg-gray-100 transition-colors">
            Discard
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageUploader({ value, onChange, label = "Image", aspect = "aspect-video" }) {
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

export default function GeneralSettingsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [tab, setTab] = useState("store");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [general, setGeneral] = useState(null);
  const [heroSlides, setHeroSlides] = useState([]);
  const [banners, setBanners] = useState([]);
  const [sections, setSections] = useState([]);

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  const load = () => {
    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setGeneral(res.data.general || {});
          setHeroSlides(res.data.homepage?.heroSlides || []);
          setBanners(res.data.homepage?.banners || []);
          setSections(res.data.homepage?.sections || []);
          setDirty(false);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/categories").then((r) => r.json()).then((res) => res.success && setCategories(res.data || []));
    fetch("/api/products?limit=200")
      .then((r) => r.json())
      .then((res) => res.success && setProducts(res.data.products || []));
  }, []);

  const markDirty = () => setDirty(true);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ general, homepage: { heroSlides, banners, sections } }),
      }).then((r) => r.json());
      if (res.success) {
        toast.success("Settings saved");
        setDirty(false);
        setGeneral(res.data.general);
        setHeroSlides(res.data.homepage.heroSlides);
        setBanners(res.data.homepage.banners);
        setSections(res.data.homepage.sections);
      } else {
        toast.error(res.message || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!can("settings")) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-bold admin-text-primary">Access denied</p>
        <p className="text-sm admin-text-muted mt-1">You don't have permission to manage settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 pb-24">
      <PageHeader
        title="General Settings"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "General" }]}
        description="Store branding and homepage content — everything here is saved to the database and reflected on the live site."
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "store" && (
        <div className="space-y-6">
          <div className="admin-card rounded-xl p-6">
            <h2 className="text-sm font-extrabold admin-text-primary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-accent rounded-full" /> Store Identity
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <ImageUploader
                  label="Store Logo"
                  aspect="aspect-[3/1] max-w-xs"
                  value={general.storeLogo}
                  onChange={(url) => { setGeneral({ ...general, storeLogo: url }); markDirty(); }}
                />
              </div>
              <Field label="Store Name">
                <Input value={general.storeName || ""} onChange={(e) => { setGeneral({ ...general, storeName: e.target.value }); markDirty(); }} />
              </Field>
              <Field label="Store Email">
                <Input type="email" value={general.storeEmail || ""} onChange={(e) => { setGeneral({ ...general, storeEmail: e.target.value }); markDirty(); }} />
              </Field>
              <Field label="Store Phone">
                <Input value={general.storePhone || ""} onChange={(e) => { setGeneral({ ...general, storePhone: e.target.value }); markDirty(); }} />
              </Field>
              <Field label="Store Address">
                <Input value={general.storeAddress || ""} onChange={(e) => { setGeneral({ ...general, storeAddress: e.target.value }); markDirty(); }} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Store Description" hint="Used in SEO meta description and About sections.">
                  <Textarea rows={3} value={general.storeDescription || ""} onChange={(e) => { setGeneral({ ...general, storeDescription: e.target.value }); markDirty(); }} />
                </Field>
              </div>
            </div>
          </div>

          <div className="admin-card rounded-xl p-6">
            <h2 className="text-sm font-extrabold admin-text-primary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-accent rounded-full" /> Header & Footer
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Header Announcement" hint="Optional strip shown at the top of the site, e.g. a promo message. Leave empty to hide.">
                  <Input value={general.headerAnnouncement || ""} onChange={(e) => { setGeneral({ ...general, headerAnnouncement: e.target.value }); markDirty(); }} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Footer About Text">
                  <Textarea rows={3} value={general.footerAbout || ""} onChange={(e) => { setGeneral({ ...general, footerAbout: e.target.value }); markDirty(); }} />
                </Field>
              </div>
              <Field label="Footer Copyright Line" hint='e.g. "© 2026 SumonMart — Made in Bangladesh"'>
                <Input value={general.footerCopyright || ""} onChange={(e) => { setGeneral({ ...general, footerCopyright: e.target.value }); markDirty(); }} />
              </Field>
            </div>
          </div>

          <div className="admin-card rounded-xl p-6">
            <h2 className="text-sm font-extrabold admin-text-primary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-accent rounded-full" /> Social Links
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {["facebook", "instagram", "youtube", "whatsapp"].map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <Input
                    value={general.socialLinks?.[k] || ""}
                    onChange={(e) => { setGeneral({ ...general, socialLinks: { ...general.socialLinks, [k]: e.target.value } }); markDirty(); }}
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "hero" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs admin-text-muted max-w-md">
              These slides appear at the top of the homepage. If you don't add any, the site falls back to auto-generated slides from your top-rated products.
            </p>
            <button
              onClick={() => { setHeroSlides([...heroSlides, { _id: uid(), image: "", title: "", subtitle: "", tag: "", buttonText: "Shop Now", buttonLink: "/products", order: heroSlides.length, active: true }]); markDirty(); }}
              className="shrink-0 bg-accent hover:bg-accent/90 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
            >
              + Add Slide
            </button>
          </div>

          {heroSlides.length === 0 && (
            <div className="admin-card rounded-xl p-10 text-center text-sm admin-text-muted">No custom slides yet — using auto-generated slides.</div>
          )}

          {heroSlides.map((slide, i) => (
            <div key={slide._id || i} className="admin-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold admin-text-muted">Slide {i + 1}</span>
                  {!slide.active && <Badge tone="neutral">Hidden</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
                    <input type="checkbox" checked={slide.active} onChange={(e) => { const next = [...heroSlides]; next[i] = { ...slide, active: e.target.checked }; setHeroSlides(next); markDirty(); }} />
                    Active
                  </label>
                  <button onClick={() => { setHeroSlides(heroSlides.filter((_, idx) => idx !== i)); markDirty(); }} className="text-xs font-bold text-rose-500 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <ImageUploader label="Slide Image" value={slide.image} onChange={(url) => { const next = [...heroSlides]; next[i] = { ...slide, image: url }; setHeroSlides(next); markDirty(); }} />
                <div className="space-y-3">
                  <Field label="Tag / label">
                    <Input value={slide.tag} onChange={(e) => { const next = [...heroSlides]; next[i] = { ...slide, tag: e.target.value }; setHeroSlides(next); markDirty(); }} />
                  </Field>
                  <Field label="Title">
                    <Input value={slide.title} onChange={(e) => { const next = [...heroSlides]; next[i] = { ...slide, title: e.target.value }; setHeroSlides(next); markDirty(); }} />
                  </Field>
                  <Field label="Subtitle">
                    <Input value={slide.subtitle} onChange={(e) => { const next = [...heroSlides]; next[i] = { ...slide, subtitle: e.target.value }; setHeroSlides(next); markDirty(); }} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Button text">
                      <Input value={slide.buttonText} onChange={(e) => { const next = [...heroSlides]; next[i] = { ...slide, buttonText: e.target.value }; setHeroSlides(next); markDirty(); }} />
                    </Field>
                    <Field label="Button link">
                      <Input value={slide.buttonLink} onChange={(e) => { const next = [...heroSlides]; next[i] = { ...slide, buttonLink: e.target.value }; setHeroSlides(next); markDirty(); }} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "banners" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs admin-text-muted max-w-md">Promotional banners you can place on the homepage.</p>
            <button
              onClick={() => { setBanners([...banners, { _id: uid(), image: "", title: "", link: "/products", order: banners.length, active: true }]); markDirty(); }}
              className="shrink-0 bg-accent hover:bg-accent/90 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
            >
              + Add Banner
            </button>
          </div>

          {banners.length === 0 && (
            <div className="admin-card rounded-xl p-10 text-center text-sm admin-text-muted">No banners yet.</div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {banners.map((b, i) => (
              <div key={b._id || i} className="admin-card rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold admin-text-muted">Banner {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
                      <input type="checkbox" checked={b.active} onChange={(e) => { const next = [...banners]; next[i] = { ...b, active: e.target.checked }; setBanners(next); markDirty(); }} />
                      Active
                    </label>
                    <button onClick={() => { setBanners(banners.filter((_, idx) => idx !== i)); markDirty(); }} className="text-xs font-bold text-rose-500 hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
                <ImageUploader label="Banner Image" value={b.image} onChange={(url) => { const next = [...banners]; next[i] = { ...b, image: url }; setBanners(next); markDirty(); }} />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Field label="Title">
                    <Input value={b.title} onChange={(e) => { const next = [...banners]; next[i] = { ...b, title: e.target.value }; setBanners(next); markDirty(); }} />
                  </Field>
                  <Field label="Link">
                    <Input value={b.link} onChange={(e) => { const next = [...banners]; next[i] = { ...b, link: e.target.value }; setBanners(next); markDirty(); }} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "sections" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs admin-text-muted max-w-md">
              Control the product grid sections on the homepage — what they're called, where the products come from, and whether they're visible.
            </p>
            <button
              onClick={() => { setSections([...sections, { _id: uid(), title: "New Section", type: "newArrivals", categoryId: "", productIds: [], maxPrice: 0, buttonText: "See all", buttonLink: "/products", order: sections.length, visible: true }]); markDirty(); }}
              className="shrink-0 bg-accent hover:bg-accent/90 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
            >
              + Add Section
            </button>
          </div>

          {sections.length === 0 && (
            <div className="admin-card rounded-xl p-10 text-center text-sm admin-text-muted">
              No custom sections yet — the homepage uses its default Top Selling / New Products sections.
            </div>
          )}

          {sections.map((s, i) => (
            <div key={s._id || i} className="admin-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold admin-text-muted">Section {i + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
                    <input type="checkbox" checked={s.visible} onChange={(e) => { const next = [...sections]; next[i] = { ...s, visible: e.target.checked }; setSections(next); markDirty(); }} />
                    Visible
                  </label>
                  <button onClick={() => { setSections(sections.filter((_, idx) => idx !== i)); markDirty(); }} className="text-xs font-bold text-rose-500 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Section title">
                  <Input value={s.title} onChange={(e) => { const next = [...sections]; next[i] = { ...s, title: e.target.value }; setSections(next); markDirty(); }} />
                </Field>
                <Field label="Source">
                  <select
                    value={s.type}
                    onChange={(e) => { const next = [...sections]; next[i] = { ...s, type: e.target.value }; setSections(next); markDirty(); }}
                    className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  >
                    {SECTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>

                {s.type === "category" && (
                  <Field label="Category">
                    <select
                      value={s.categoryId || ""}
                      onChange={(e) => { const next = [...sections]; next[i] = { ...s, categoryId: e.target.value }; setSections(next); markDirty(); }}
                      className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                    >
                      <option value="">Select a category</option>
                      {categories.map((c) => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                )}

                {s.type === "underPrice" && (
                  <Field label="Max price (৳)">
                    <Input type="number" min="0" value={s.maxPrice || 0} onChange={(e) => { const next = [...sections]; next[i] = { ...s, maxPrice: Number(e.target.value) }; setSections(next); markDirty(); }} />
                  </Field>
                )}

                {s.type === "manual" && (
                  <div className="sm:col-span-2">
                    <span className="text-xs font-bold admin-text-secondary mb-1.5 block">Pick products</span>
                    <div className="admin-border border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                      {products.map((p) => {
                        const checked = (s.productIds || []).includes(p._id);
                        return (
                          <label key={p._id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const ids = new Set(s.productIds || []);
                                if (e.target.checked) ids.add(p._id); else ids.delete(p._id);
                                const next = [...sections];
                                next[i] = { ...s, productIds: Array.from(ids) };
                                setSections(next);
                                markDirty();
                              }}
                            />
                            <span className="admin-text-primary font-medium">{p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Field label="Button text">
                  <Input value={s.buttonText} onChange={(e) => { const next = [...sections]; next[i] = { ...s, buttonText: e.target.value }; setSections(next); markDirty(); }} />
                </Field>
                <Field label="Button link">
                  <Input value={s.buttonLink} onChange={(e) => { const next = [...sections]; next[i] = { ...s, buttonLink: e.target.value }; setSections(next); markDirty(); }} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={load} />
    </div>
  );
}
