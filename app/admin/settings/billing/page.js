// app/admin/settings/billing/page.js
"use client";

import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";

export default function BillingSettingsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Billing"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Billing" }]}
        description="Business billing info and invoice configuration."
      />
      <div className="admin-card rounded-xl">
        <EmptyState
          icon="🧾"
          title="Billing — coming in the next update"
          description="This module will manage your billing/tax info and a configurable, printable/downloadable invoice template for every order."
        />
      </div>
    </div>
  );
}
