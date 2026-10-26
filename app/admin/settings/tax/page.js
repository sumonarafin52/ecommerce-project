"use client";

// app/admin/settings/tax/page.js
//
// Tax setup: whether tax applies at all, whether prices already include it,
// and the zones and rates themselves.
//
// The inclusive/exclusive switch is the one that costs real money if it's
// wrong, so it's shown with a worked example rather than a bare toggle — an
// admin should be able to see which one matches their prices.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import usePermissions from "@/lib/usePermissions";
import Checkbox from "@/components/admin/ui/Checkbox";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const inputCls = "admin-input w-full";
const labelCls = "block text-[11px] font-bold uppercase tracking-wide admin-text-muted mb-1.5";
// Same look, but without `w-full` — appending w-32 to a class that already
// says w-full leaves the winner down to stylesheet order, which is why the
// inline "add a rate" row rendered as a full-width stack.
const narrowCls = "admin-input";

const APPLIES_LABELS = { all: "All products", physical: "Physical only", digital: "Digital only" };

export default function TaxSettingsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  const [tax, setTax] = useState(null);
  const [zones, setZones] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newZone, setNewZone] = useState({ name: "", countries: "", states: "", priority: 0 });
  const [newRate, setNewRate] = useState({});

  const load = () => {
    setLoadError(false);
    Promise.all([
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/tax", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([s, t]) => {
        if (s.success) {
          setTax({
            enabled: false,
            pricesIncludeTax: true,
            displayNote: "",
            basedOn: "shipping",
            storeCountry: "",
            storeState: "",
            ...(s.data.tax || {}),
          });
        } else setLoadError(true);
        if (t.success) setZones(t.data.zones);
      })
      .catch(() => setLoadError(true))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Permissions resolve a tick after the session does. The earlier version
    // cleared `loading` on that first pass — before can("settings") was
    // true — so the page rendered its body with `tax` still null and threw.
    if (permLoading || status === "loading") return;
    if (status === "authenticated" && can("settings")) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, permLoading, can]);

  const saveSettings = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax }),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    res.success ? toast.success("Tax settings saved") : toast.error(res.message || "Couldn't save");
    setSaving(false);
  };

  const call = async (method, body, qs = "") => {
    const res = await fetch(`/api/admin/tax${qs}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    if (res.success) load();
    else toast.error(res.message || "Something went wrong");
    return res;
  };

  const addZone = async (e) => {
    e.preventDefault();
    if (!newZone.name.trim()) return toast.error("Give the zone a name");
    const res = await call("POST", {
      kind: "zone",
      name: newZone.name,
      countries: newZone.countries.split(",").map((s) => s.trim()).filter(Boolean),
      states: newZone.states.split(",").map((s) => s.trim()).filter(Boolean),
      priority: newZone.priority,
    });
    if (res.success) {
      setNewZone({ name: "", countries: "", states: "", priority: 0 });
      toast.success("Zone added");
    }
  };

  const addRate = async (zoneId) => {
    const draft = newRate[zoneId] || {};
    if (!draft.name?.trim()) return toast.error("Give the rate a name, e.g. VAT");
    const res = await call("POST", {
      kind: "rate",
      zone: zoneId,
      name: draft.name,
      rate: draft.rate,
      appliesTo: draft.appliesTo || "all",
      taxShipping: draft.taxShipping !== false,
      compound: !!draft.compound,
    });
    if (res.success) {
      setNewRate((r) => ({ ...r, [zoneId]: {} }));
      toast.success("Rate added");
    }
  };

  // `tax` is also checked: a permitted admin whose settings are still in
  // flight must not fall through to the body, which dereferences it.
  if (!loadError && (status === "loading" || permLoading || loading || (can("settings") && !tax))) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("settings")) {
    return (
      <PermissionGate
        perm="settings"
        what="store settings"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }


  if (loadError) {

    return <ErrorState what="tax settings" onRetry={() => { setLoadError(false); load(); }} />;

  }

  const example = 1000;
  const sampleRate = zones.flatMap((z) => z.rates || []).find((r) => r.active)?.rate ?? 15;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-8">
      <div>
        <nav className="text-xs admin-text-muted">
          <Link href="/admin/settings" className="hover:underline">
            Settings
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-bold admin-text-primary">Tax</span>
        </nav>
        <h1 className="mt-2 text-2xl font-bold admin-text-primary">Tax</h1>
        <p className="mt-1 text-xs admin-text-muted">
          Define where you charge tax and at what rate. Tax is worked out on the server when an order is placed, and
          frozen onto that order — changing a rate later never alters an old invoice.
        </p>
      </div>

      {/* ===== core settings ===== */}
      <div className="admin-card space-y-5 rounded-2xl p-6">
        <Checkbox
          checked={!!tax.enabled}
          onChange={(on) => setTax((t) => ({ ...t, enabled: on }))}
          label={<span className="font-bold">Charge tax on orders</span>}
          hint="While this is off, no tax is calculated and your totals stay exactly as they are now."
        />

        {tax.enabled && (
          <>
            <div>
              <span className={labelCls}>How your prices are entered</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  [
                    true,
                    "Prices include tax",
                    `A ৳${example} product stays ৳${example}. The tax inside it (৳${(example - example / (1 + sampleRate / 100)).toFixed(2)} at ${sampleRate}%) is reported, not added.`,
                  ],
                  [
                    false,
                    "Prices exclude tax",
                    `A ৳${example} product becomes ৳${(example * (1 + sampleRate / 100)).toFixed(2)} at checkout — tax is added on top.`,
                  ],
                ].map(([value, title, desc]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setTax((t) => ({ ...t, pricesIncludeTax: value }))}
                    className={`rounded-xl border-2 p-3 text-left transition-colors ${
                      !!tax.pricesIncludeTax === value
                        ? "border-accent bg-accent/10"
                        : "border-black/10 bg-white hover:border-accent/40"
                    }`}
                  >
                    <span className="block text-sm font-bold admin-text-primary">{title}</span>
                    <span className="mt-0.5 block text-[11px] admin-text-muted">{desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] admin-text-muted">
                Most Bangladesh and EU stores include tax in the displayed price. US stores usually don&apos;t.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Which address decides the rate</label>
                <select
                  className={inputCls}
                  value={tax.basedOn}
                  onChange={(e) => setTax((t) => ({ ...t, basedOn: e.target.value }))}
                >
                  <option value="shipping">The customer&apos;s address</option>
                  <option value="store">Always the store&apos;s address</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Note shown next to prices</label>
                <input
                  className={inputCls}
                  value={tax.displayNote}
                  onChange={(e) => setTax((t) => ({ ...t, displayNote: e.target.value }))}
                  placeholder="incl. VAT"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Store country</label>
                <input
                  className={inputCls}
                  value={tax.storeCountry}
                  onChange={(e) => setTax((t) => ({ ...t, storeCountry: e.target.value }))}
                  placeholder="Bangladesh"
                />
              </div>
              <div>
                <label className={labelCls}>Store state / district</label>
                <input
                  className={inputCls}
                  value={tax.storeState}
                  onChange={(e) => setTax((t) => ({ ...t, storeState: e.target.value }))}
                  placeholder="Dhaka District"
                />
              </div>
            </div>
            <p className="-mt-2 text-[11px] admin-text-muted">
              Used when an order has no delivery address to judge by — a download-only order, for instance.
            </p>
          </>
        )}

        <Button onClick={saveSettings} disabled={saving}>
          {saving ? "Saving…" : "Save tax settings"}
        </Button>
      </div>

      {/* ===== zones and rates ===== */}
      {tax.enabled && (
        <>
          <div className="admin-card rounded-2xl p-6">
            <h2 className="text-base font-extrabold admin-text-primary">Tax zones</h2>
            <p className="mt-0.5 text-xs admin-text-muted">
              The most specific zone that matches a customer&apos;s address wins: country + state beats country, which
              beats a zone with no countries listed (your catch-all).
            </p>

            {zones.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-black/10 py-8 text-center text-xs admin-text-muted">
                No zones yet. Without one, no tax is charged anywhere.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {zones.map((z) => (
                  <div key={z._id} className="rounded-xl border border-black/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold admin-text-primary">
                          {z.name}
                          {!z.active && (
                            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              off
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] admin-text-muted">
                          {z.countries?.length ? z.countries.join(", ") : "Everywhere (catch-all)"}
                          {z.states?.length ? ` · ${z.states.join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => call("PUT", { kind: "zone", id: z._id, active: !z.active })}
                          className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-bold admin-text-primary hover:bg-black/5"
                        >
                          {z.active ? "Turn off" : "Turn on"}
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete the "${z.name}" zone and its ${z.rates.length} rate(s)? Orders already placed keep the tax they were charged.`
                              )
                            ) {
                              call("DELETE", null, `?kind=zone&id=${z._id}`);
                            }
                          }}
                          className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {z.rates.length === 0 && (
                        <p className="text-[11px] admin-text-muted">No rates in this zone — it charges nothing.</p>
                      )}
                      {z.rates.map((r) => (
                        <div
                          key={r._id}
                          className="flex flex-wrap items-center gap-2 rounded-lg bg-black/[0.02] px-3 py-2"
                        >
                          <span className="text-xs font-bold admin-text-primary">{r.name}</span>
                          <span className="rounded bg-[#EAF4FF] px-1.5 py-0.5 text-[11px] font-bold text-[#2C5282]">
                            {r.rate}%
                          </span>
                          <span className="text-[11px] admin-text-muted">{APPLIES_LABELS[r.appliesTo]}</span>
                          {!r.taxShipping && <span className="text-[11px] admin-text-muted">· shipping untaxed</span>}
                          {r.compound && <span className="text-[11px] admin-text-muted">· compound</span>}
                          {!r.active && (
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              off
                            </span>
                          )}
                          <div className="ml-auto flex gap-2">
                            <Button variant="link" onClick={() => call("PUT", { kind: "rate", id: r._id, active: !r.active })}>
                              {r.active ? "Turn off" : "Turn on"}
                            </Button>
                            <button
                              onClick={() => call("DELETE", null, `?kind=rate&id=${r._id}`)}
                              className="text-[11px] font-bold text-rose-700 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* add a rate to this zone */}
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/5 pt-3">
                      <input
                        className={`${narrowCls} w-32`}
                        placeholder="VAT"
                        value={newRate[z._id]?.name || ""}
                        onChange={(e) => setNewRate((s) => ({ ...s, [z._id]: { ...s[z._id], name: e.target.value } }))}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className={`${narrowCls} w-24`}
                        placeholder="15"
                        value={newRate[z._id]?.rate ?? ""}
                        onChange={(e) => setNewRate((s) => ({ ...s, [z._id]: { ...s[z._id], rate: e.target.value } }))}
                      />
                      <select
                        className={`${narrowCls} w-40`}
                        value={newRate[z._id]?.appliesTo || "all"}
                        onChange={(e) =>
                          setNewRate((s) => ({ ...s, [z._id]: { ...s[z._id], appliesTo: e.target.value } }))
                        }
                      >
                        <option value="all">All products</option>
                        <option value="physical">Physical only</option>
                        <option value="digital">Digital only</option>
                      </select>
                      <Checkbox
                        compact
                        label="Tax shipping"
                        checked={newRate[z._id]?.taxShipping !== false}
                        onChange={(on) =>
                          setNewRate((s) => ({ ...s, [z._id]: { ...s[z._id], taxShipping: on } }))
                        }
                      />
                      <button
                        onClick={() => addRate(z._id)}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white hover:bg-accent/90"
                      >
                        Add rate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={addZone} className="admin-card space-y-4 rounded-2xl p-6">
            <h2 className="text-base font-extrabold admin-text-primary">Add a zone</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Name *</label>
                <input
                  className={inputCls}
                  value={newZone.name}
                  onChange={(e) => setNewZone((z) => ({ ...z, name: e.target.value }))}
                  placeholder="Bangladesh"
                />
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <input
                  type="number"
                  className={inputCls}
                  value={newZone.priority}
                  onChange={(e) => setNewZone((z) => ({ ...z, priority: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Countries (comma separated)</label>
              <input
                className={inputCls}
                value={newZone.countries}
                onChange={(e) => setNewZone((z) => ({ ...z, countries: e.target.value }))}
                placeholder="Bangladesh — or leave empty for a catch-all"
              />
            </div>
            <div>
              <label className={labelCls}>States / districts (optional)</label>
              <input
                className={inputCls}
                value={newZone.states}
                onChange={(e) => setNewZone((z) => ({ ...z, states: e.target.value }))}
                placeholder="Dhaka District, Chattogram"
              />
            </div>
            <Button type="submit">
              Add zone
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
