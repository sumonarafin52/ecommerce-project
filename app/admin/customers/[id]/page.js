// app/admin/customers/[id]/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/admin/ui/PageHeader";
import Badge from "@/components/admin/ui/Badge";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";

const STATUS_TONE = {
  pending: "warning", processing: "info", shipped: "accent",
  delivered: "success", cancelled: "danger", returned: "danger", on_hold: "neutral",
};

export default function AdminCustomerDetail() {
  const { id } = useParams();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (permLoading || !can("customers")) return;
    fetch(`/api/admin/customers/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setData(res.data) : setError(res.message)))
      .catch(() => setError("Couldn't load this customer"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, permLoading]);
  if (permLoading || permFailed || !can("customers")) {
    return (
      <PermissionGate
        perm="customers"
        what="customer accounts"
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
        <p className="admin-text-secondary text-sm">{error}</p>
        <Link href="/admin/customers" className="text-accent text-sm font-bold hover:underline">← Back to customers</Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-4">
        <div className="admin-card rounded-xl h-28 animate-pulse" />
        <div className="admin-card rounded-xl h-64 animate-pulse" />
      </div>
    );
  }

  const { customer, stats, statusCounts, orders, addresses } = data;
  const cards = [
    { label: "Lifetime value", value: formatCurrency(stats.spent), sub: "received, net of refunds" },
    { label: "Orders", value: stats.orders, sub: `${stats.paidOrders} paid` },
    { label: "Average order", value: formatCurrency(Math.round(stats.avgOrder)), sub: "across paid orders" },
    { label: "Last order", value: stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "—", sub: stats.lastOrderAt ? "" : "no orders yet" },
  ];

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        breadcrumb={[{ label: "Customers", href: "/admin/customers" }, { label: customer.name }]}
        title={customer.name}
        description={customer.email}
        action={
          <Button as="a" href={`mailto:${customer.email}`}>
            Email customer
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {cards.map((c) => (
          <div key={c.label} className="admin-card rounded-xl p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide admin-text-muted">{c.label}</p>
            <p className="text-2xl font-bold admin-text-primary mt-1">{c.value}</p>
            {c.sub && <p className="text-[11px] admin-text-muted mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="admin-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b admin-border flex items-center justify-between">
            <h2 className="text-[14px] font-semibold admin-text-primary">Order history</h2>
            {orders.length >= 25 && <span className="text-[11px] admin-text-muted">showing latest 25</span>}
          </div>
          {orders.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm admin-text-muted">This customer hasn&apos;t ordered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left border-b admin-border">
                    <th className="p-3 font-semibold admin-text-secondary">Order</th>
                    <th className="p-3 font-semibold admin-text-secondary">Date</th>
                    <th className="p-3 font-semibold admin-text-secondary">Items</th>
                    <th className="p-3 font-semibold admin-text-secondary">Payment</th>
                    <th className="p-3 font-semibold admin-text-secondary">Status</th>
                    <th className="p-3 font-semibold admin-text-secondary text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id} className="border-b admin-border last:border-0">
                      <td className="p-3">
                        <Link href={`/admin/orders/${o._id}`} className="font-semibold text-accent hover:underline">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3 admin-text-muted whitespace-nowrap">{formatDate(o.createdAt)}</td>
                      <td className="p-3 admin-text-secondary">{o.itemCount}</td>
                      <td className="p-3">
                        <span className="admin-text-secondary capitalize">{o.paymentMethod}</span>{" "}
                        <span className={o.paymentStatus === "paid" ? "text-emerald-600 font-semibold" : "admin-text-muted"}>
                          · {o.paymentStatus}
                        </span>
                      </td>
                      <td className="p-3"><Badge tone={STATUS_TONE[o.orderStatus] || "neutral"}>{o.orderStatus}</Badge></td>
                      <td className="p-3 text-right font-bold admin-text-primary whitespace-nowrap">{formatCurrency(o.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="admin-card rounded-xl p-5">
            <h2 className="text-[14px] font-semibold admin-text-primary mb-3">Account</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="admin-text-muted">Joined</dt>
                <dd className="admin-text-primary">{formatDateTime(customer.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="admin-text-muted">Role</dt>
                <dd><Badge tone={customer.role === "customer" ? "neutral" : "info"}>{customer.role}</Badge></dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="admin-text-muted">Returns</dt>
                <dd className="admin-text-primary">{stats.returns}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="admin-text-muted">Support messages</dt>
                <dd className="admin-text-primary">{stats.tickets}</dd>
              </div>
            </dl>
          </div>

          {Object.keys(statusCounts).length > 0 && (
            <div className="admin-card rounded-xl p-5">
              <h2 className="text-[14px] font-semibold admin-text-primary mb-3">Order status</h2>
              <ul className="space-y-1.5 text-sm">
                {Object.entries(statusCounts).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="admin-text-secondary capitalize">{k.replace("_", " ")}</span>
                    <span className="font-semibold admin-text-primary">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="admin-card rounded-xl p-5">
            <h2 className="text-[14px] font-semibold admin-text-primary mb-3">
              Saved addresses {addresses.length > 0 && <span className="admin-text-muted font-normal">({addresses.length})</span>}
            </h2>
            {addresses.length === 0 ? (
              <p className="text-sm admin-text-muted">No saved addresses.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {addresses.map((a) => (
                  <li key={a._id} className="border-b admin-border last:border-0 pb-3 last:pb-0">
                    <p className="font-semibold admin-text-primary">
                      {a.fullName} {a.isDefault && <Badge tone="info">default</Badge>}
                    </p>
                    <p className="admin-text-secondary">{a.phone}</p>
                    <p className="admin-text-muted">{[a.address, a.city, a.state, a.postalCode].filter(Boolean).join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
