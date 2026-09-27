// app/admin/newsletter/page.js
"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";
import usePermissions from "@/lib/usePermissions";
import { formatDateTime } from "@/lib/utils";

export default function AdminNewsletterPage() {
  const { can, loading: permLoading } = usePermissions();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (permLoading || !can("customers")) return;
    fetch("/api/newsletter", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => res.success && setData(res.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  if (permLoading) return null;
  if (!can("customers")) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
        <p className="admin-text-secondary text-sm">You don&apos;t have permission to view subscribers.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Newsletter"
        description="People who signed up in the site footer. Export to your email tool to send campaigns."
        action={
          data?.subscribers?.length > 0 && (
            <a
              href="/api/newsletter?format=csv"
              className="bg-accent hover:bg-accent/90 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
            >
              Export CSV
            </a>
          )
        }
      />

      {!data ? (
        <div className="admin-card rounded-xl h-40 animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="admin-card rounded-xl p-5">
              <p className="text-xs admin-text-muted font-bold uppercase tracking-wide">Subscribed</p>
              <p className="text-3xl font-bold admin-text-primary mt-1">{data.subscribers.length}</p>
            </div>
            <div className="admin-card rounded-xl p-5">
              <p className="text-xs admin-text-muted font-bold uppercase tracking-wide">Unsubscribed</p>
              <p className="text-3xl font-bold admin-text-primary mt-1">{data.unsubscribed}</p>
            </div>
          </div>

          {data.subscribers.length === 0 ? (
            <EmptyState icon="📬" title="No subscribers yet" description="Signups from the footer form will appear here." />
          ) : (
            <div className="admin-card rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b admin-border text-left">
                    <th className="p-3 font-semibold admin-text-secondary">Email</th>
                    <th className="p-3 font-semibold admin-text-secondary">Source</th>
                    <th className="p-3 font-semibold admin-text-secondary">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscribers.slice(0, 200).map((s) => (
                    <tr key={s._id} className="border-b admin-border last:border-0">
                      <td className="p-3 admin-text-primary">{s.email}</td>
                      <td className="p-3 admin-text-muted capitalize">{s.source}</td>
                      <td className="p-3 admin-text-muted">{formatDateTime(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs admin-text-muted mt-4">
            The CSV includes each subscriber&apos;s personal unsubscribe link (<code>unsubscribe_url</code>) — add it to every
            campaign email.
          </p>
        </>
      )}
    </div>
  );
}
