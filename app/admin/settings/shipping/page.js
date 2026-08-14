// app/admin/settings/shipping/page.js
"use client";

import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";

export default function ShippingSettingsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Shipping"
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Shipping" }]}
        description="Shipping methods, carriers, zones, rates and order shipment tracking."
      />
      <div className="admin-card rounded-xl">
        <EmptyState
          icon="🚚"
          title="Shipping — coming in the next update"
          description="This module will add shipping methods, carrier management, zone-based rates, order shipment tracking with a timeline, and a customer-facing tracking page."
        />
      </div>
    </div>
  );
}
