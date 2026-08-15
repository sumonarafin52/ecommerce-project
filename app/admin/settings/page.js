// app/admin/settings/page.js
"use client";

import Link from "next/link";
import PageHeader from "@/components/admin/ui/PageHeader";
import Badge from "@/components/admin/ui/Badge";

const modules = [
  {
    href: "/admin/settings/general",
    title: "General",
    desc: "Store info, branding, header/footer details & homepage builder",
    icon: "🏬",
    status: "ready",
  },
  {
    href: "/admin/settings/payment",
    title: "Payment Methods",
    desc: "Stripe, PayPal, SSLCommerz, bKash, Nagad, Rocket & more",
    icon: "💳",
    status: "ready",
  },
  {
    href: "/admin/settings/billing",
    title: "Billing",
    desc: "Business billing info & invoice configuration",
    icon: "🧾",
    status: "ready",
  },
  {
    href: "/admin/settings/shipping",
    title: "Shipping",
    desc: "Shipping methods, carriers, zones, rates & order tracking",
    icon: "🚚",
    status: "ready",
  },
];

export default function SettingsHome() {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Settings"
        description="Manage store-wide configuration. More modules will appear here over time."
      />
      <div className="grid sm:grid-cols-2 gap-4">
        {modules.map((m) => (
          <Link key={m.href} href={m.href} className="admin-card rounded-xl p-5 flex items-start gap-4">
            <span className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-xl shrink-0">
              {m.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-extrabold admin-text-primary">{m.title}</p>
                {m.status === "soon" && <Badge tone="warning">Coming soon</Badge>}
                {m.status === "ready" && <Badge tone="success">Ready</Badge>}
              </div>
              <p className="text-xs admin-text-muted">{m.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
