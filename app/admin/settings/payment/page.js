// app/admin/settings/payment/page.js
"use client";

import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";

export default function PaymentSettingsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Payment Methods"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Payment Methods" }]}
        description="Configure Stripe, PayPal, SSLCommerz, bKash, Nagad, Rocket and other payment gateways."
      />
      <div className="admin-card rounded-xl">
        <EmptyState
          icon="💳"
          title="Payment Methods — coming in the next update"
          description="This module will let you enable/disable each gateway, store credentials securely, switch sandbox/live mode, and test connections. Existing SSLCommerz checkout keeps working as-is until this ships."
        />
      </div>
    </div>
  );
}
