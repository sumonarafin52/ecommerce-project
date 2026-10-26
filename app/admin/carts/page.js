// app/admin/carts/page.js
//
// Baskets customers filled and did not buy.
//
// Everything on this page is a real figure or a real action: the values are
// computed from today's catalogue, "Send reminder" sends an email and says
// so when it can't, and "Recovered" means an order actually followed a
// reminder. There is no open rate and no conversion estimate, because the
// shop cannot measure either one honestly.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import EmptyState from "@/components/admin/ui/EmptyState";
import Badge from "@/components/admin/ui/Badge";
import Icon from "@/components/ui/Icon";
import usePermissions from "@/lib/usePermissions";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import FilterChips from "@/components/admin/ui/FilterChips";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const TABS = [
  { key: "abandoned", label: "Abandoned" },
  { key: "reminded", label: "Reminded" },
  { key: "recovered", label: "Recovered" },
  { key: "active", label: "Still shopping" },
];

const STATE_TONE = { abandoned: "warning", reminded: "info", recovered: "success", active: "neutral", empty: "neutral" };

/** "3 hours ago" — a basket's age is the whole point of this page. */
function ago(date) {
  if (!date) return "—";
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default function AdminCartsPage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("abandoned");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState("");
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(
    (state = tab) => {
      setLoading(true);
      setLoadError(false);
      fetch(`/api/admin/carts?state=${state}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setData(res.data);
          else setLoadError(true);
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));
    },
    [tab]
  );

  useEffect(() => {
    if (permLoading || !can("carts")) {
      setLoading(false);
      return;
    }
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, tab]);

  const remind = async (row) => {
    setSending(row._id);
    try {
      const res = await fetch(`/api/admin/carts/${row._id}/remind`, { method: "POST" }).then((r) => r.json());
      // The failure message is the server's own reason — opted out, nothing
      // buyable, already reminded — not a generic "couldn't send".
      if (res.success) {
        toast.success(res.message);
        load();
      } else {
        toast.error(res.message || "Reminder not sent.");
      }
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setSending("");
    }
  };

  const sweep = async () => {
    setSweeping(true);
    try {
      const res = await fetch("/api/admin/carts/sweep", { method: "POST" }).then((r) => r.json());
      if (res.success) {
        const { sent, considered } = res.data;
        toast.success(
          sent === 0
            ? considered === 0
              ? "No baskets are due a reminder."
              : `${considered} due, none sent — check the opted-out and sold-out ones below.`
            : `${sent} reminder${sent === 1 ? "" : "s"} sent.`
        );
        load();
      } else {
        toast.error(res.message || "Couldn't send reminders.");
      }
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setSweeping(false);
    }
  };
  if (permLoading || permFailed || !can("carts")) {
    return (
      <PermissionGate
        perm="carts"
        what="abandoned baskets"
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="abandoned baskets" onRetry={() => { setLoadError(false); load(); }} />;
  }

  const summary = data?.summary;

  return (
    <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
      <PageHeader
        title="Abandoned Baskets"
        description={`Baskets saved by signed-in customers. One counts as abandoned after ${
          summary?.abandonedAfterHours ?? 4
        } hours with no activity, and each gets at most one reminder.`}
        action={
          <Button onClick={sweep} disabled={sweeping}>
            <Icon name="mail" size={15} />
            {sweeping ? "Sending…" : "Send all due"}
          </Button>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Waiting", value: summary.abandoned, sub: "quiet, full, not yet reminded" },
            { label: "Reminded", value: summary.reminded, sub: "emails actually sent" },
            { label: "Recovered", value: summary.recovered, sub: "ordered after a reminder" },
            {
              label: "Recovered value",
              value: formatCurrency(summary.recoveredValue),
              sub: "basket value when reminded",
            },
          ].map((c) => (
            <div key={c.label} className="admin-card rounded-xl p-5">
              <p className="text-xs admin-text-muted font-bold uppercase tracking-wide">{c.label}</p>
              <p className="text-2xl font-bold admin-text-primary mt-1">{c.value}</p>
              <p className="text-[11px] admin-text-muted mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      <FilterChips
        ariaLabel="Basket state"
        className="mb-4 flex-nowrap overflow-x-auto no-scrollbar"
        options={TABS}
        value={tab}
        onChange={setTab}
      />

      {loading ? (
        <div className="admin-card rounded-xl h-64 animate-pulse" />
      ) : !data?.rows?.length ? (
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="cart"
            title={tab === "abandoned" ? "No abandoned baskets" : "Nothing here"}
            description={
              tab === "abandoned"
                ? "Baskets saved by signed-in customers appear here once they've sat untouched."
                : "Try another tab."
            }
          />
        </div>
      ) : (
        <div className="admin-card rounded-xl divide-y admin-border">
          {data.rows.map((row) => (
            <div key={row._id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
              {/* who */}
              <div className="lg:w-56 shrink-0">
                <p className="text-sm font-bold admin-text-primary truncate">{row.customer?.name || "Deleted customer"}</p>
                <p className="text-xs admin-text-muted truncate">{row.customer?.email || "—"}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <Badge tone={STATE_TONE[row.state]}>{row.state}</Badge>
                  {row.optedOut && <Badge tone="neutral">reminders off</Badge>}
                </div>
              </div>

              {/* what */}
              <div className="flex-1 min-w-0">
                {row.items.length ? (
                  <ul className="text-xs admin-text-secondary space-y-1">
                    {row.items.slice(0, 3).map((item, i) => (
                      <li key={i} className="truncate">
                        {item.name} <span className="admin-text-muted">× {item.quantity}</span> —{" "}
                        {formatCurrency(item.price * item.quantity)}
                      </li>
                    ))}
                    {row.items.length > 3 && (
                      <li className="admin-text-muted">+ {row.items.length - 3} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-xs admin-text-muted">
                    {row.state === "recovered"
                      ? `Reminded about ${row.reminderItemCount} item${row.reminderItemCount === 1 ? "" : "s"}, then bought.`
                      : "Nothing left in this basket."}
                  </p>
                )}
                {row.unavailable > 0 && (
                  <p className="text-[11px] text-[#8E0B21] mt-1.5">
                    {row.unavailable} item{row.unavailable === 1 ? "" : "s"} no longer buyable
                  </p>
                )}
              </div>

              {/* numbers */}
              <div className="lg:w-44 shrink-0">
                <p className="text-base font-bold admin-text-primary">
                  {formatCurrency(row.items.length ? row.value : row.reminderValue)}
                </p>
                <p className="text-[11px] admin-text-muted">
                  {row.items.length ? "at today's prices" : row.reminderValue > 0 ? "when reminded" : "—"}
                </p>
                <p className="text-[11px] admin-text-muted mt-1">Last active {ago(row.lastActivityAt)}</p>
                {row.reminderSentAt && (
                  <p className="text-[11px] admin-text-muted">Reminded {ago(row.reminderSentAt)}</p>
                )}
              </div>

              {/* action */}
              <div className="lg:w-40 shrink-0 flex lg:justify-end">
                {row.recoveredOrder ? (
                  <Link
                    href={`/admin/orders/${row.recoveredOrder._id}`}
                    className="text-xs font-bold text-accent hover:underline"
                  >
                    Order {row.recoveredOrder.orderNumber} →
                  </Link>
                ) : row.optedOut ? (
                  <span className="text-[11px] admin-text-muted">Opted out</span>
                ) : row.reminderCount > 0 ? (
                  <span className="text-[11px] admin-text-muted">Reminder already sent</span>
                ) : !row.items.length ? (
                  <span className="text-[11px] admin-text-muted">Nothing to remind about</span>
                ) : row.state === "active" ? (
                  // They were in this basket minutes ago. An email about it
                  // could easily arrive while they are still looking at it.
                  <span className="text-[11px] admin-text-muted">Still shopping</span>
                ) : (
                  <button
                    onClick={() => remind(row)}
                    disabled={sending === row._id}
                    className="border admin-border hover:border-accent hover:text-accent admin-text-secondary text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {sending === row._id ? "Sending…" : "Send reminder"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
