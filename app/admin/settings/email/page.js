// app/admin/settings/email/page.js
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import { Field, Input, SaveBar } from "@/components/admin/ui/FormField";
import Toggle from "@/components/admin/ui/Toggle";
import usePermissions from "@/lib/usePermissions";

const MASK = "••••••••";

export default function EmailSettingsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [email, setEmail] = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setEmail({ smtpPort: 587, smtpSecure: false, ...res.data.email });
          setDirty(false);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (patch) => {
    setEmail((e) => ({ ...e, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setEmail(res.data.email);
      setDirty(false);
      toast.success("Email settings saved");
    } catch (err) {
      toast.error(err.message || "Failed to save");
    }
    setSaving(false);
  };

  const sendTest = async () => {
    if (dirty) {
      toast.error("Save your settings first, then send a test email.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/settings/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message || "Failed to send test email");
    }
    setTesting(false);
  };

  if (loading || permLoading || !email) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
        <div className="admin-card rounded-xl p-8 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!can("settings")) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
        <p className="admin-text-secondary text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6 pb-24">
      <PageHeader
        title="Email Notifications"
        description="Send order, payment, shipment and refund updates to customers by email via SMTP."
      />

      <div className="admin-card rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold admin-text-primary">Enable email notifications</p>
            <p className="text-xs admin-text-muted mt-0.5">
              When off, customers still see in-app notifications on their Profile page — just no emails go out.
            </p>
          </div>
          <Toggle checked={email.enabled} onChange={(v) => set({ enabled: v })} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t admin-border">
          <Field label="From name" hint="Shown as the sender name in the customer's inbox">
            <Input placeholder="SumonMart" value={email.fromName} onChange={(e) => set({ fromName: e.target.value })} />
          </Field>
          <Field label="From email">
            <Input placeholder="orders@yourstore.com" value={email.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="SMTP host">
            <Input placeholder="smtp.gmail.com" value={email.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} />
          </Field>
          <Field label="SMTP port">
            <Input type="number" placeholder="587" value={email.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) || 587 })} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="SMTP username">
            <Input placeholder="you@gmail.com" value={email.smtpUser} onChange={(e) => set({ smtpUser: e.target.value })} />
          </Field>
          <Field label="SMTP password" hint={email.smtpPassword === MASK ? "Leave as-is to keep the current password" : ""}>
            <Input
              type="password"
              placeholder={email.smtpPassword === MASK ? MASK : "App password / SMTP password"}
              value={email.smtpPassword === MASK ? "" : email.smtpPassword}
              onChange={(e) => set({ smtpPassword: e.target.value })}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-semibold admin-text-secondary cursor-pointer">
          <input type="checkbox" checked={email.smtpSecure} onChange={(e) => set({ smtpSecure: e.target.checked })} className="w-4 h-4 accent-accent" />
          Use SSL (port 465) — leave unchecked for STARTTLS on port 587
        </label>

        <div className="pt-2 border-t admin-border">
          <button
            onClick={sendTest}
            disabled={testing || !email.enabled}
            className="text-sm font-bold border admin-border rounded-lg px-4 py-2 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {testing ? "Sending..." : "Send test email to my account"}
          </button>
          {!email.enabled && <p className="text-[11px] admin-text-muted mt-1.5">Enable email notifications above first.</p>}
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={load} />
    </div>
  );
}
