// app/admin/settings/shipping/page.js
"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Tabs from "@/components/admin/ui/Tabs";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import ImageUploader from "@/components/admin/ui/ImageUploader";
import { Field, Input, Textarea } from "@/components/admin/ui/FormField";
import usePermissions from "@/lib/usePermissions";
import Checkbox from "@/components/admin/ui/Checkbox";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";

const TABS = [
  { key: "zones", label: "Zones" },
  { key: "methods", label: "Methods" },
  { key: "carriers", label: "Carriers" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Each tab loads independently, so a failure belongs in the tab rather than
// over the whole page — the other two tabs may be perfectly fine.
function TabError({ onRetry }) {
  return (
    <div className="rounded-xl border border-dashed admin-border py-10 text-center">
      <p className="text-sm font-bold admin-text-primary">Couldn&apos;t load this</p>
      <p className="text-xs admin-text-muted mt-1">The server didn&apos;t answer. Nothing has been changed.</p>
      <Button className="mt-3" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function Card({ children }) {
  return <div className="admin-card rounded-xl p-5">{children}</div>;
}

function RowActions({ onSave, onDelete, saving }) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="link" className="disabled:opacity-50" onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button variant="link-danger" onClick={onDelete}>Delete</Button>
    </div>
  );
}

// ---------------- Zones ----------------
function ZonesTab() {
  const [loadError, setLoadError] = useState(false);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch("/api/shipping/zones").then((r) => r.json()).then((res) => (res.success ? setZones(res.data) : setLoadError(true))).finally(() => setLoading(false));
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

  if (loadError) return <TabError onRetry={load} />;
  if (loading) return <p className="text-sm admin-text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs admin-text-muted max-w-md">Regions your shipping methods apply to — e.g. Dhaka, Outside Dhaka, International.</p>
        <Button size="sm" onClick={addZone}>+ Add Zone</Button>
      </div>
      {zones.length === 0 && <Card><EmptyState icon="map" title="No zones yet" description="Add your first shipping zone to get started." /></Card>}
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
            <Checkbox compact label="Active" checked={z.active} onChange={(on) => update(i, { active: on })} />
            <RowActions onSave={() => save(i)} onDelete={() => remove(z, i)} saving={savingId === z._id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Carriers ----------------
function CarriersTab() {
  const [loadError, setLoadError] = useState(false);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch("/api/shipping/carriers").then((r) => r.json()).then((res) => (res.success ? setCarriers(res.data) : setLoadError(true))).finally(() => setLoading(false));
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

  if (loadError) return <TabError onRetry={load} />;
  if (loading) return <p className="text-sm admin-text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs admin-text-muted max-w-md">
          Delivery companies you work with. Each one can track by hand, or book and check status over the courier&apos;s API
          where there is one — set that up under Courier API integration.
        </p>
        <Button size="sm" onClick={addCarrier}>+ Add Carrier</Button>
      </div>
      {carriers.length === 0 && <Card><EmptyState icon="truck" title="No carriers yet" description="Add Pathao, Steadfast, RedX, or any courier you use." /></Card>}
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
          {!c.isNew && <CarrierApiPanel carrierId={c._id} carrierName={c.name} />}

          <div className="flex items-center justify-between mt-3">
            <Checkbox compact label="Active" checked={c.active} onChange={(on) => update(i, { active: on })} />
            <RowActions onSave={() => save(i)} onDelete={() => remove(c, i)} saving={savingId === c._id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// Courier API integration for one carrier.
//
// Most couriers have no API, which is why "Manual" is the default and says
// so rather than looking like a missing feature. For one that does, the
// credentials are saved encrypted and "Test connection" proves them before
// an order depends on them — an adapter written from a provider's docs but
// never run against a live account is labelled as exactly that.
function CarrierApiPanel({ carrierId, carrierName }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setLoadError(false);
    fetch(`/api/shipping/carriers/${carrierId}/api`)
      .then((r) => r.json())
      .then((res) => (res.success ? setState(res.data) : setLoadError(true)))
      .catch(() => setLoadError(true));
  }, [carrierId]);

  useEffect(() => {
    if (open && !state) load();
  }, [open, state, load]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-bold text-accent hover:underline"
      >
        Courier API integration →
      </button>
    );
  }
  if (!state) return <p className="mt-3 text-xs admin-text-muted">Loading integration…</p>;

  const provider = state.providers.find((p) => p.id === state.provider) || state.providers[0];
  const isManual = provider.id === "manual";

  const setCred = (key, value) =>
    setState((s) => ({ ...s, credentials: { ...s.credentials, [key]: value } }));

  const saveApi = async () => {
    setBusy("save");
    const res = await fetch(`/api/shipping/carriers/${carrierId}/api`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: state.provider, connected: state.connected, credentials: state.credentials }),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    res.success ? toast.success(res.message) : toast.error(res.message);
    setBusy("");
    setState(null);
    load();
  };

  const test = async () => {
    setBusy("test");
    const res = await fetch(`/api/shipping/carriers/${carrierId}/api`, { method: "POST" })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    res.success ? toast.success(res.message) : toast.error(res.message);
    setBusy("");
    setState(null);
    load();
  };

  return (
    <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.015] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold admin-text-primary">Courier API — {carrierName}</p>
          <p className="text-[11px] admin-text-muted">{provider.description}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-bold admin-text-muted">
          Hide
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Integration">
          <select
            className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
            value={state.provider}
            onChange={(e) => setState((s) => ({ ...s, provider: e.target.value, credentials: {} }))}
          >
            {state.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        {!isManual && (
          <Checkbox
            compact
            className="pb-2"
            label="Use this integration for bookings"
            checked={!!state.connected}
            onChange={(on) => setState((s) => ({ ...s, connected: on }))}
          />
        )}
      </div>

      {!isManual && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {provider.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  type={f.secret ? "password" : "text"}
                  value={state.credentials[f.key] || ""}
                  onChange={(e) => setCred(f.key, e.target.value)}
                />
              </Field>
            ))}
          </div>

          {!provider.verified && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              This integration was written from {provider.label}&apos;s published documentation and has not been run
              against a live merchant account here. Use <b>Test connection</b> with your own credentials before any
              order depends on it.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] admin-text-muted">
              Can: {Object.entries(provider.capabilities).filter(([, v]) => v).map(([k]) => k).join(", ") || "nothing"}
            </span>
            {state.lastTestedAt && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  state.lastTestOk ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                last test: {state.lastTestOk ? "ok" : "failed"}
              </span>
            )}
          </div>
          {state.lastTestMessage && (
            <p className="mt-1 text-[11px] admin-text-muted">{state.lastTestMessage}</p>
          )}
        </>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={saveApi}
          disabled={busy === "save"}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save integration"}
        </button>
        {!isManual && (
          <button
            type="button"
            onClick={test}
            disabled={busy === "test"}
            className="rounded-lg border border-black/10 px-4 py-2 text-xs font-bold admin-text-primary disabled:opacity-50"
          >
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- Methods ----------------
function MethodsTab() {
  const [loadError, setLoadError] = useState(false);
  const [methods, setMethods] = useState([]);
  const [zones, setZones] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch("/api/shipping/methods").then((r) => r.json()),
      fetch("/api/shipping/zones").then((r) => r.json()),
      fetch("/api/shipping/carriers").then((r) => r.json()),
    ]).then(([m, z, c]) => {
      if (m.success) setMethods(m.data.map((x) => ({ ...x, zone: x.zone?._id || x.zone, carrier: x.carrier?._id || x.carrier || "" })));
      else setLoadError(true);
      if (z.success) setZones(z.data);
      if (c.success) setCarriers(c.data);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
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

  if (loadError) return <TabError onRetry={load} />;
  if (loading) return <p className="text-sm admin-text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs admin-text-muted max-w-md">Delivery options customers see at checkout — each belongs to a zone and has its own rate.</p>
        <Button size="sm" onClick={addMethod}>+ Add Method</Button>
      </div>
      {zones.length === 0 && <Card><EmptyState icon="map" title="Create a zone first" description="Shipping methods need to belong to a zone — add one in the Zones tab." /></Card>}
      {zones.length > 0 && methods.length === 0 && <Card><EmptyState icon="package" title="No shipping methods yet" description='e.g. "Standard Delivery", "Same-Day Delivery", "Cash on Delivery"' /></Card>}
      {methods.map((m, i) => (
        <Card key={m._id}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Method name"><Input value={m.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
            <Field label="Zone">
              <select value={m.zone} onChange={(e) => update(i, { zone: e.target.value })} className="admin-input w-full">
                {zones.map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}
              </select>
            </Field>
            <Field label="Carrier (optional)">
              <select value={m.carrier || ""} onChange={(e) => update(i, { carrier: e.target.value })} className="admin-input w-full">
                <option value="">None</option>
                {carriers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Estimated delivery" hint='e.g. "2-3 business days"'>
              <Input value={m.estimatedDelivery} onChange={(e) => update(i, { estimatedDelivery: e.target.value })} />
            </Field>
            <Field label="Rate type">
              <select value={m.rateType} onChange={(e) => update(i, { rateType: e.target.value })} className="admin-input w-full">
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
              <Checkbox compact label="Active" checked={m.active} onChange={(on) => update(i, { active: on })} />
              <Checkbox
                compact
                label="COD allowed"
                checked={m.codAllowed}
                onChange={(on) => update(i, { codAllowed: on })}
              />
            </div>
            <RowActions onSave={() => save(i)} onDelete={() => remove(m, i)} saving={savingId === m._id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function ShippingSettingsPage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [tab, setTab] = useState("zones");

  if (permLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (permLoading || permFailed || !can("settings")) {
    return (
      <PermissionGate
        perm="settings"
        what="store settings"
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
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
