// app/admin/settings/billing/page.js
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Tabs from "@/components/admin/ui/Tabs";
import ImageUploader from "@/components/admin/ui/ImageUploader";
import { Field, Input, Textarea, SaveBar } from "@/components/admin/ui/FormField";
import usePermissions from "@/lib/usePermissions";

const TABS = [
  { key: "business", label: "Business Info" },
  { key: "invoice", label: "Invoice Settings" },
];

const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR"];
const DATE_FORMATS = ["DD MMM YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

export default function BillingSettingsPage() {
  const { can, loading: permLoading } = usePermissions();
  const [tab, setTab] = useState("business");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [billing, setBilling] = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setBilling(res.data.billing || {});
          setDirty(false);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (patch) => { setBilling({ ...billing, ...patch }); setDirty(true); };
  const setInvoice = (patch) => { setBilling({ ...billing, invoice: { ...billing.invoice, ...patch } }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing }),
      }).then((r) => r.json());
      if (res.success) {
        toast.success("Billing settings saved");
        setBilling(res.data.billing);
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

  if (permLoading || loading || !billing) {
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
        title="Billing"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Billing" }]}
        description="Business billing details and invoice configuration — used on every generated invoice."
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "business" && (
        <div className="admin-card rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-extrabold admin-text-primary mb-1 flex items-center gap-2">
            <span className="w-1 h-4 bg-accent rounded-full" /> Store Billing Information
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Legal / Business Name">
              <Input value={billing.legalName || ""} onChange={(e) => set({ legalName: e.target.value })} />
            </Field>
            <Field label="Tax / VAT / BIN ID">
              <Input value={billing.taxId || ""} onChange={(e) => set({ taxId: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Billing Address">
                <Textarea rows={2} value={billing.billingAddress || ""} onChange={(e) => set({ billingAddress: e.target.value })} />
              </Field>
            </div>
            <Field label="Country">
              <Input value={billing.country || ""} onChange={(e) => set({ country: e.target.value })} />
            </Field>
            <Field label="State / Province">
              <Input value={billing.state || ""} onChange={(e) => set({ state: e.target.value })} />
            </Field>
            <Field label="City">
              <Input value={billing.city || ""} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <Field label="Postal / ZIP Code">
              <Input value={billing.postalCode || ""} onChange={(e) => set({ postalCode: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={billing.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={billing.email || ""} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Registration / Company Info" hint="Trade license, company registration number, etc.">
                <Input value={billing.registrationInfo || ""} onChange={(e) => set({ registrationInfo: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Additional Billing Info">
                <Textarea rows={2} value={billing.additionalInfo || ""} onChange={(e) => set({ additionalInfo: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "invoice" && (
        <div className="space-y-6">
          <div className="admin-card rounded-xl p-6">
            <h2 className="text-sm font-extrabold admin-text-primary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-accent rounded-full" /> Invoice Branding
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <ImageUploader
                  label="Invoice Logo"
                  aspect="aspect-[3/1] max-w-xs"
                  value={billing.invoice?.logo || ""}
                  onChange={(url) => setInvoice({ logo: url })}
                />
              </div>
              <Field label="Business Name on Invoice" hint="Falls back to Legal/Business Name if left blank.">
                <Input value={billing.invoice?.businessName || ""} onChange={(e) => setInvoice({ businessName: e.target.value })} />
              </Field>
              <Field label="Contact Info on Invoice">
                <Input value={billing.invoice?.contactInfo || ""} onChange={(e) => setInvoice({ contactInfo: e.target.value })} placeholder="email · phone" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address on Invoice" hint="Falls back to Billing Address if left blank.">
                  <Textarea rows={2} value={billing.invoice?.address || ""} onChange={(e) => setInvoice({ address: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          <div className="admin-card rounded-xl p-6">
            <h2 className="text-sm font-extrabold admin-text-primary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-accent rounded-full" /> Numbering & Format
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Invoice Number Prefix" hint='e.g. "INV-" -> INV-00001'>
                <Input value={billing.invoice?.numberPrefix ?? ""} onChange={(e) => setInvoice({ numberPrefix: e.target.value })} />
              </Field>
              <Field label="Number Padding" hint="Digits in the running number, e.g. 5 -> 00001">
                <Input type="number" min="1" max="10" value={billing.invoice?.numberPadding ?? 5} onChange={(e) => setInvoice({ numberPadding: Number(e.target.value) })} />
              </Field>
              <Field label="Next Invoice Number" hint="Advance this to skip ahead (e.g. after importing old invoices). Never decreases automatically.">
                <Input
                  type="number"
                  min="1"
                  value={billing.nextInvoiceNumber ?? 1}
                  onChange={(e) => set({ nextInvoiceNumber: Number(e.target.value) })}
                />
              </Field>
              <Field label="Invoice Date Format">
                <select
                  value={billing.invoice?.dateFormat || "DD MMM YYYY"}
                  onChange={(e) => setInvoice({ dateFormat: e.target.value })}
                  className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                >
                  {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  value={billing.invoice?.currency || "BDT"}
                  onChange={(e) => setInvoice({ currency: e.target.value })}
                  className="admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="admin-card rounded-xl p-6">
            <h2 className="text-sm font-extrabold admin-text-primary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-accent rounded-full" /> Content
            </h2>
            <div className="grid gap-4">
              <Field label="Tax / VAT Note" hint='Shown as a line item label, e.g. "VAT (15%)". Leave blank to hide.'>
                <Input value={billing.invoice?.taxInfo || ""} onChange={(e) => setInvoice({ taxInfo: e.target.value })} />
              </Field>
              <Field label="Payment Information" hint="Bank details, mobile banking number, etc. — shown on every invoice.">
                <Textarea rows={3} value={billing.invoice?.paymentInfo || ""} onChange={(e) => setInvoice({ paymentInfo: e.target.value })} />
              </Field>
              <Field label="Additional Notes">
                <Textarea rows={2} value={billing.invoice?.additionalNotes || ""} onChange={(e) => setInvoice({ additionalNotes: e.target.value })} />
              </Field>
              <Field label="Footer Text">
                <Input value={billing.invoice?.footerText || ""} onChange={(e) => setInvoice({ footerText: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={load} />
    </div>
  );
}
