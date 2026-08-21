// app/admin/settings/payment/page.js
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Tabs from "@/components/admin/ui/Tabs";
import Badge from "@/components/admin/ui/Badge";
import Toggle from "@/components/admin/ui/Toggle";
import { Field, Input, Textarea, SaveBar } from "@/components/admin/ui/FormField";
import usePermissions from "@/lib/usePermissions";
import { PAYMENT_GATEWAYS, MASK, isGatewayConfigured } from "@/lib/paymentGateways";

const REGION_TABS = [
  { key: "bangladesh", label: "Bangladesh" },
  { key: "international", label: "International" },
];

function emptyStateFor(gateway) {
  const fields = {};
  gateway.fields.forEach((f) => (fields[f.key] = ""));
  return { enabled: false, mode: "sandbox", fields };
}

function GatewayCard({ gateway, state, onChange }) {
  const configured = isGatewayConfigured(gateway, state.fields);

  const setField = (key, value) => {
    onChange({ ...state, fields: { ...state.fields, [key]: value } });
  };

  const validate = () => {
    const missing = gateway.fields.filter((f) => f.required && !String(state.fields[f.key] || "").trim());
    if (missing.length) {
      toast.error(`Missing: ${missing.map((f) => f.label).join(", ")}`);
    } else {
      toast.success(`${gateway.label} configuration looks complete`);
    }
  };

  return (
    <div className="admin-card rounded-xl overflow-hidden">
      <div className="p-5 flex flex-wrap items-start justify-between gap-3 admin-border border-b">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-lg font-black text-accent shrink-0">
            {gateway.label.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-extrabold admin-text-primary">{gateway.label}</h3>
              {configured ? (
                <Badge tone="success">Ready</Badge>
              ) : (
                <Badge tone="neutral">Incomplete</Badge>
              )}
              {state.enabled && configured && gateway.checkoutLive && <Badge tone="accent">Live on checkout</Badge>}
              {state.enabled && configured && !gateway.checkoutLive && (
                <Badge tone="warning">Not connected to checkout yet</Badge>
              )}
              {gateway.hasModes && (
                <Badge tone={state.mode === "live" ? "warning" : "info"}>
                  {state.mode === "live" ? "Live mode" : "Sandbox"}
                </Badge>
              )}
            </div>
            <p className="text-xs admin-text-muted mt-1 max-w-md">{gateway.description}</p>
          </div>
        </div>
        <Toggle
          checked={state.enabled}
          onChange={(val) => onChange({ ...state, enabled: val })}
          label={state.enabled ? "Enabled" : "Disabled"}
        />
      </div>

      <div className="p-5 space-y-4">
        {gateway.hasModes && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold admin-text-secondary">Mode:</span>
            <div className="inline-flex admin-border border rounded-lg overflow-hidden">
              {["sandbox", "live"].map((m) => (
                <button
                  key={m}
                  onClick={() => onChange({ ...state, mode: m })}
                  className={`px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                    state.mode === m ? "bg-accent text-white" : "admin-text-secondary hover:bg-gray-100"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {gateway.fields.map((f) => {
            const value = state.fields[f.key] || "";
            const isMasked = f.secret && value === MASK;
            const FieldComponent = f.type === "textarea" ? Textarea : Input;
            return (
              <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                <Field
                  label={`${f.label}${f.required ? " *" : ""}`}
                  hint={isMasked ? "Currently set — type a new value to replace it." : undefined}
                >
                  <FieldComponent
                    type={f.type === "textarea" ? undefined : f.secret ? "password" : "text"}
                    rows={f.type === "textarea" ? 3 : undefined}
                    value={isMasked ? "" : value}
                    placeholder={isMasked ? MASK : ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                </Field>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={validate}
            className="text-xs font-bold text-accent hover:underline"
          >
            Validate configuration
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSettingsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [tab, setTab] = useState("bangladesh");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [gateways, setGateways] = useState(() => {
    const init = {};
    PAYMENT_GATEWAYS.forEach((g) => (init[g.id] = emptyStateFor(g)));
    return init;
  });

  const load = () => {
    setLoading(true);
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const next = {};
          PAYMENT_GATEWAYS.forEach((g) => {
            const stored = res.data.payment?.[g.id];
            next[g.id] = stored
              ? { enabled: !!stored.enabled, mode: stored.mode || "sandbox", fields: { ...emptyStateFor(g).fields, ...stored.fields } }
              : emptyStateFor(g);
          });
          setGateways(next);
          setDirty(false);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateGateway = (id, nextState) => {
    setGateways((g) => ({ ...g, [id]: nextState }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment: gateways }),
      }).then((r) => r.json());

      if (res.success) {
        toast.success("Payment settings saved");
        const next = {};
        PAYMENT_GATEWAYS.forEach((g) => {
          const stored = res.data.payment?.[g.id];
          next[g.id] = stored
            ? { enabled: !!stored.enabled, mode: stored.mode || "sandbox", fields: { ...emptyStateFor(g).fields, ...stored.fields } }
            : emptyStateFor(g);
        });
        setGateways(next);
        setDirty(false);
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

  const visibleGateways = PAYMENT_GATEWAYS.filter((g) => g.region === tab);
  const enabledCount = PAYMENT_GATEWAYS.filter((g) => gateways[g.id]?.enabled).length;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 pb-24">
      <PageHeader
        title="Payment Methods"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Payment Methods" }]}
        description="Enable gateways and store their credentials securely — secrets are masked here and never sent back to the browser in plain text."
        action={
          enabledCount > 0 ? (
            <Badge tone="success">{enabledCount} enabled</Badge>
          ) : (
            <Badge tone="neutral">None enabled yet</Badge>
          )
        }
      />

      <Tabs tabs={REGION_TABS} active={tab} onChange={setTab} />

      <div className="space-y-4">
        {visibleGateways.map((gateway) => (
          <GatewayCard
            key={gateway.id}
            gateway={gateway}
            state={gateways[gateway.id]}
            onChange={(next) => updateGateway(gateway.id, next)}
          />
        ))}
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={load} />
    </div>
  );
}
