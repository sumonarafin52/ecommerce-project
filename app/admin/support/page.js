// app/admin/support/page.js
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import usePermissions from "@/lib/usePermissions";
import { formatDateTime } from "@/lib/utils";

const TOPIC = { order: "Order", payment: "Payment", product: "Product", account: "Account", other: "Other" };
const TONE = { open: "warning", answered: "info", closed: "neutral" };

export default function AdminSupportPage() {
  const { can, loading: permLoading } = usePermissions();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [openId, setOpenId] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ scope: "all" });
    if (filter !== "all") qs.set("status", filter);
    fetch(`/api/support?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => res.success && setTickets(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!permLoading && can("customers")) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, permLoading]);

  const update = async (ticket, body, success) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/support/${ticket._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success(success);
      setReply("");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't update the ticket");
    }
    setBusy(false);
  };

  if (permLoading) return null;
  if (!can("customers")) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
        <p className="admin-text-secondary text-sm">You don&apos;t have permission to view support messages.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
      <PageHeader title="Support" description="Messages from the Contact page. Replies are emailed to the customer." />

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b admin-border mb-5">
        {["open", "answered", "closed", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-2.5 text-sm font-semibold capitalize whitespace-nowrap border-b-2 -mb-px transition-colors ${
              filter === f ? "border-accent text-accent" : "border-transparent admin-text-secondary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="admin-card rounded-xl h-20 animate-pulse" />)}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState icon="💬" title={filter === "open" ? "No open messages" : "Nothing here"} description="New Contact-page messages show up here." />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const expanded = openId === t._id;
            return (
              <div key={t._id} className="admin-card rounded-xl">
                <button
                  onClick={() => { setOpenId(expanded ? "" : t._id); setReply(""); }}
                  className="w-full text-left p-4 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold admin-text-primary truncate">{t.subject}</span>
                      <Badge tone={TONE[t.status]}>{t.status}</Badge>
                    </div>
                    <p className="text-xs admin-text-muted mt-1">
                      {t.name} · {t.email} · {TOPIC[t.category]}
                      {t.orderNumber ? ` · ${t.orderNumber}` : ""} · {formatDateTime(t.updatedAt)}
                    </p>
                  </div>
                  <span className="text-xs admin-text-muted">{t.ticketNumber}</span>
                </button>

                {expanded && (
                  <div className="border-t admin-border p-4 space-y-3">
                    {t.messages.map((m, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3.5 py-2.5 text-sm ${
                          m.from === "staff" ? "bg-accent/10 ml-8" : "bg-gray-50 mr-8"
                        }`}
                      >
                        <p className="text-[11px] font-bold admin-text-muted mb-1">
                          {m.from === "staff" ? `${m.authorName || "Support"} (staff)` : m.authorName} · {formatDateTime(m.at)}
                        </p>
                        <p className="admin-text-primary whitespace-pre-line">{m.body}</p>
                      </div>
                    ))}
                    {t.phone && <p className="text-xs admin-text-muted">Phone: {t.phone}</p>}

                    {t.status !== "closed" && (
                      <>
                        <textarea
                          rows={4}
                          maxLength={5000}
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder={`Reply to ${t.name} — this is emailed to ${t.email}`}
                          className="admin-input w-full rounded-lg px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2 justify-end">
                          <button
                            onClick={() => update(t, { status: "closed" }, "Ticket closed")}
                            disabled={busy}
                            className="text-xs font-bold border admin-border px-3.5 py-2 rounded-lg admin-text-secondary disabled:opacity-50"
                          >
                            Close without reply
                          </button>
                          <button
                            onClick={() => update(t, { reply }, "Reply sent")}
                            disabled={busy || reply.trim().length < 2}
                            className="text-xs font-bold bg-accent text-white hover:bg-accent/90 px-3.5 py-2 rounded-lg disabled:opacity-50"
                          >
                            Send reply
                          </button>
                        </div>
                      </>
                    )}
                    {t.status === "closed" && (
                      <button
                        onClick={() => update(t, { status: "open" }, "Ticket reopened")}
                        className="text-xs font-bold text-accent hover:underline"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
