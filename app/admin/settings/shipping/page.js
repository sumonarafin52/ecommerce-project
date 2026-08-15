// app/admin/settings/shipping/page.js
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Tabs from "@/components/admin/ui/Tabs";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import ImageUploader from "@/components/admin/ui/ImageUploader";
import { Field, Input, Textarea } from "@/components/admin/ui/FormField";
import usePermissions from "@/lib/usePermissions";

const TABS = [
  { key: "zones", label: "Zones" },
  { key: "methods", label: "Methods" },
  { key: "carriers", label: "Carriers" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function Card({ children }) {
  return <div className="admin-card rounded-xl p-5">{children}</div>;
}

function RowActions({ onSave, onDelete, saving }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onSave} disabled={saving} className="text-xs font-bold text-accent hover:underline disabled:opacity-50">
        {saving ? "Saving..." : "Save"}
      </button>
      <button onClick={onDelete} className="text-xs font-bold text-rose-500 hover:underline">Delete</button>
    </div>
  );
}

// ---------------- Zones ----------------
function ZonesTab() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/shipping/zones").then((r) => r.json()).then((res) => res.success && setZones(res.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addZone = () => {
    setZones([{ _id: `new-${uid()}`, name: "New Zone", regions: [], active: true, order: zones.length, isNew: true }, ...zones]);
  };

  const update = (i, patch) => {
    const next = [...zones];
    next[i] = { ...next[i], ...patch };
    setZones(next);
  };

  const save = async (i) => {
    const z = zones[i];
    setSavingId(z._id);
    try {
      const method = z.isNew ? "POST" : "PUT";
      const url = z.isNew ? "/api/shipping/zones" : `/api/shipping/zones/${z._id}`;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(z) }).then((r) => r.json());
      if (res.success) {
        toast.success("Zone saved");
        load();
      } else toast.error(res.message);
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (z, i) => {
    if (z.isNew) {
      setZones(zones.filter((_, idx) => idx !== i));
      return;
    }
    if (!confirm(`Delete zone "${z.name}"?`)) return;
    const res = await fetch(`/api/shipping/zones/${z._id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.success) load();
    else toast.error(res.message);
  };

  if (loading) return <p className="text-sm admin-text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs admin-text-muted max-w-md">Regions your shipping methods apply to — e.g. Dhaka, Outside Dhaka, International.</p>
        <button onClick={addZone} className="bg-accent hover:bg-accent/90 text-white text-xs font-bold px-4 py-2.5 rounded-lg">+ Add Zone</button>
      </div>
      {zones.length === 0 && <Card><EmptyState icon="🗺️" title="No zones yet" description="Add your first shipping zone to get started." /></Card>}
      {zones.map((z, i) => (
        <Card key={z._id}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Zone name">
              <Input value={z.name} onChange={(e) => update(i, { name: e.target.value })} />
            </Field>
            <Field label="Regions" hint="Comma-separated, e.g. Dhaka, Gazipur, Narayanganj">
              <Input
                value={(z.regions || []).join(", ")}
                onChange={(e) => update(i, { regions: e.target.value.split(",").map((s) => s.trim()) })}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
              <input type="checkbox" checked={z.active} onChange={(e) => update(i, { active: e.target.checked })} /> Active
            </label>
            <RowActions onSave={() => save(i)} onDelete={() => remove(z, i)} saving={savingId === z._id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Carriers ----------------
function CarriersTab() {
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/shipping/carriers").then((r) => r.json()).then((res) => res.success && setCarriers(res.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addCarrier = () => {
    setCarriers([{ _id: `new-${uid()}`, name: "New Carrier", logo: "", contactPerson: "", phone: "", email: "", website: "", trackingUrlTemplate: "", notes: "", active: true, isNew: true }, ...carriers]);
  };
  const update = (i, patch) => { const next = [...carriers]; next[i] = { ...next[i], ...patch }; setCarriers(next); };

  const save = async (i) => {
    const c = carriers[i];
    setSavingId(c._id);
    try {
      const method = c.isNew ? "POST" : "PUT";
      const url = c.isNew ? "/api/shipping/carriers" : `/api/shipping/carriers/${c._id}`;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((r) => r.json());
      if (res.success) { toast.success("Carrier saved"); load(); } else toast.error(res.message);
    } finally { setSavingId(null); }
  };

  const remove = async (c, i) => {
    if (c.isNew) { setCarriers(carriers.filter((_, idx) => idx !== i)); return; }
    if (!confirm(`Delete carrier "${c.name}"?`)) return;
    const res = await fetch(`/api/shipping/carriers/${c._id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.success) load(); else toast.error(res.message);
  };

  if (loading) return <p className="text-sm admin-text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs admin-text-muted max-w-md">Delivery companies you work with — manual tracking today, API-ready for later.</p>
        <button onClick={addCarrier} className="bg-accent hover:bg-accent/90 text-white text-xs font-bold px-4 py-2.5 rounded-lg">+ Add Carrier</button>
      </div>
      {carriers.length === 0 && <Card><EmptyState icon="🚚" title="No carriers yet" description="Add Pathao, Steadfast, RedX, or any courier you use." /></Card>}
      {carriers.map((c, i) => (
        <Card key={c._id}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <ImageUploader label="Logo" aspect="aspect-[3/1] max-w-[160px]" value={c.logo} onChange={(url) => update(i, { logo: url })} />
            </div>
            <Field label="Carrier name"><Input value={c.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
            <Field label="Contact person"><Input value={c.contactPerson} onChange={(e) => update(i, { contactPerson: e.target.value })} /></Field>
            <Field label="Phone"><Input value={c.phone} onChange={(e) => update(i, { phone: e.target.value })} /></Field>
            <Field label="Email"><Input value={c.email} onChange={(e) => update(i, { email: e.target.value })} /></Field>
            <Field label="Website"><Input value={c.website} onChange={(e) => update(i, { website: e.target.value })} /></Field>
            <Field label="Tracking URL template" hint="Use {tracking_number} as a placeholder">
              <Input value={c.trackingUrlTemplate} onChange={(e) => update(i, { trackingUrlTemplate: e.target.value })} placeholder="https://carrier.com/track/{tracking_number}" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea rows={2} value={c.notes} onChange={(e) => update(i, { notes: e.target.value })} /></Field>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
              <input type="checkbox" checked={c.active} onChange={(e) => update(i, { active: e.target.checked })} /> Active
            </label>
            <RowActions onSave={() => save(i)} onDelete={() => remove(c, i)} saving={savingId === c._id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Methods ----------------
function MethodsTab() {
  const [methods, setMethods] = useState([]);
  const [zones, setZones] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/shipping/methods").then((r) => r.json()),
      fetch("/api/shipping/zones").then((r) => r.json()),
      fetch("/api/shipping/carriers").then((r) => r.json()),
    ]).then(([m, z, c]) => {
      if (m.success) setMethods(m.data.map((x) => ({ ...x, zone: x.zone?._id || x.zone, carrier: x.carrier?._id || x.carrier || "" })));
      if (z.success) setZones(z.data);
      if (c.success) setCarriers(c.data);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addMethod = () => {
    if (!zones.length) { toast.error("Create a zone first"); return; }
    setMethods([{ _id: `new-${uid()}`, name: "New Method", description: "", zone: zones[0]._id, carrier: "", estimatedDelivery: "", rateType: "flat", flatRate: 0, weightTiers: [], freeShippingThreshold: 0, codAllowed: true, active: true, isNew: true }, ...methods]);
  };
  const update = (i, patch) => { const next = [...methods]; next[i] = { ...next[i], ...patch }; setMethods(next); };

  const save = async (i) => {
    const m = methods[i];
    setSavingId(m._id);
    try {
      const method = m.isNew ? "POST" : "PUT";
      const url = m.isNew ? "/api/shipping/methods" : `/api/shipping/methods/${m._id}`;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).then((r) => r.json());
      if (res.success) { toast.success("Method saved"); load(); } else toast.error(res.message);
    } finally { setSavingId(null); }
  };

  const remove = async (m, i) => {
    if (m.isNew) { setMethods(methods.filter((_, idx) => idx !== i)); return; }
    if (!confirm(`Delete method "${m.name}"?`)) return;
    const res = await fetch(`/api/shipping/methods/${m._id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.success) load(); else toast.error(res.message);
  };

  if (loading) return <p className="text-sm admin-text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs admin-text-muted max-w-md">Delivery options customers see at checkout — each belongs to a zone and has its own rate.</p>
        <button onClick={addMethod} className="bg-accent hover:bg-accent/90 text-white text-xs font-bold px-4 py-2.5 rounded-lg">+ Add Method</button>
      </div>
      {zones.length === 0 && <Card><EmptyState icon="🗺️" title="Create a zone first" description="Shipping methods need to belong to a zone — add one in the Zones tab." /></Card>}
      {zones.length > 0 && methods.length === 0 && <Card><EmptyState icon="📦" title="No shipping methods yet" description='e.g. "Standard Delivery", "Same-Day Delivery", "Cash on Delivery"' /></Card>}
      {methods.map((m, i) => (
        <Card key={m._id}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Method name"><Input value={m.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
            <Field label="Zone">
              <select value={m.zone} onChange={(e) => update(i, { zone: e.target.value })} className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none">
                {zones.map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}
              </select>
            </Field>
            <Field label="Carrier (optional)">
              <select value={m.carrier || ""} onChange={(e) => update(i, { carrier: e.target.value })} className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none">
                <option value="">None</option>
                {carriers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Estimated delivery" hint='e.g. "2-3 business days"'>
              <Input value={m.estimatedDelivery} onChange={(e) => update(i, { estimatedDelivery: e.target.value })} />
            </Field>
            <Field label="Rate type">
              <select value={m.rateType} onChange={(e) => update(i, { rateType: e.target.value })} className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none">
                <option value="flat">Flat rate</option>
                <option value="weightBased">Weight-based</option>
              </select>
            </Field>
            {m.rateType === "flat" ? (
              <Field label="Flat rate (৳)">
                <Input type="number" min="0" value={m.flatRate} onChange={(e) => update(i, { flatRate: Number(e.target.value) })} />
              </Field>
            ) : (
              <Field label="Weight tiers" hint="max kg : rate — one per line, e.g. 1:80">
                <Textarea
                  rows={2}
                  value={(m.weightTiers || []).map((t) => `${t.maxWeightKg}:${t.rate}`).join("\n")}
                  onChange={(e) => update(i, {
                    weightTiers: e.target.value.split("\n").map((l) => {
                      const [maxWeightKg, rate] = l.split(":").map((s) => Number(s.trim()));
                      return { maxWeightKg: maxWeightKg || 0, rate: rate || 0 };
                    }).filter((t) => t.maxWeightKg > 0),
                  })}
                />
              </Field>
            )}
            <Field label="Free shipping above (৳)" hint="0 disables free shipping for this method">
              <Input type="number" min="0" value={m.freeShippingThreshold} onChange={(e) => update(i, { freeShippingThreshold: Number(e.target.value) })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description"><Textarea rows={2} value={m.description} onChange={(e) => update(i, { description: e.target.value })} /></Field>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
                <input type="checkbox" checked={m.active} onChange={(e) => update(i, { active: e.target.checked })} /> Active
              </label>
              <label className="flex items-center gap-1.5 text-xs font-bold admin-text-secondary cursor-pointer">
                <input type="checkbox" checked={m.codAllowed} onChange={(e) => update(i, { codAllowed: e.target.checked })} /> COD allowed
              </label>
            </div>
            <RowActions onSave={() => save(i)} onDelete={() => remove(m, i)} saving={savingId === m._id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function ShippingSettingsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [tab, setTab] = useState("zones");

  if (permLoading) {
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
        title="Shipping"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Shipping" }]}
        description="Zones, delivery methods and carriers. Order-level tracking happens from each order's detail view."
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "zones" && <ZonesTab />}
      {tab === "methods" && <MethodsTab />}
      {tab === "carriers" && <CarriersTab />}
    </div>
  );
}
