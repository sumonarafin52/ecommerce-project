"use client";

// app/admin/downloads/page.js
//
// Customer Downloads — every digital entitlement the store has issued, what
// has been used, and what the download log says about it.
//
// The point of this page is to make the things that were already modelled
// but unreachable actually operable: revoking a leaked purchase, extending
// access for a customer who asked, topping up someone who lost their
// downloads, and seeing when one purchase is being pulled from a suspicious
// number of addresses.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import usePermissions from "@/lib/usePermissions";
import FilterChips from "@/components/admin/ui/FilterChips";
import PermissionGate from "@/components/admin/ui/PermissionGate";

const inputCls = "admin-input w-full";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "exhausted", label: "Used up" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OUTCOME_STYLES = {
  served: "bg-emerald-100 text-emerald-800",
  denied_auth: "bg-rose-100 text-rose-800",
  denied_limit: "bg-amber-100 text-amber-800",
  denied_expired: "bg-amber-100 text-amber-800",
  denied_revoked: "bg-rose-100 text-rose-800",
  denied_token: "bg-rose-100 text-rose-800",
  denied_rate: "bg-amber-100 text-amber-800",
  error: "bg-slate-200 text-slate-700",
};
const OUTCOME_LABELS = {
  served: "Delivered",
  denied_auth: "Not their purchase",
  denied_limit: "Out of downloads",
  denied_expired: "Access expired",
  denied_revoked: "Revoked",
  denied_token: "Bad or expired link",
  denied_rate: "Rate limited",
  error: "Delivery failed",
};

export default function AdminDownloadsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [openLog, setOpenLog] = useState(null); // grant row whose history is shown
  const [logs, setLogs] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    const params = new URLSearchParams({ q, status: filter, page: String(page) });
    fetch(`/api/admin/downloads?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return setFailed(true);
        setRows(res.data.grants);
        setMeta({ total: res.data.total, page: res.data.page, pages: res.data.pages });
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [q, filter, page]);

  useEffect(() => {
    if (status === "authenticated" && can("products")) {
      // debounce the search box so typing doesn't fire a query per keystroke
      const t = setTimeout(load, q ? 350 : 0);
      return () => clearTimeout(t);
    }
    setLoading(false);
  }, [status, can, load, q]);

  const showLog = async (row) => {
    setOpenLog(row);
    setLogLoading(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/admin/downloads/${row.id}`, { cache: "no-store" }).then((r) => r.json());
      if (res.success) setLogs(res.data);
    } catch {
      /* the panel shows an empty state */
    }
    setLogLoading(false);
  };

  const act = async (row, action, extra = {}) => {
    const res = await fetch(`/api/admin/downloads/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));

    if (res.success) {
      toast.success(res.message || "Done");
      load();
      if (openLog?.id === row.id) setOpenLog({ ...openLog, ...res.data });
    } else {
      toast.error(res.message || "Could not update");
    }
  };

  const revoke = (row) => {
    const reason = window.prompt(
      `Revoke ${row.customerEmail || "this customer"}'s access to "${row.productName}"?\n\nThey'll be notified and won't be able to download it again.\n\nReason (optional, shown to them):`
    );
    if (reason === null) return; // cancelled
    act(row, "revoke", { reason });
  };

  const extend = (row) => {
    const days = window.prompt("Extend access by how many days?", "30");
    if (days === null) return;
    act(row, "extend", { days });
  };

  const topUp = (row) => {
    const downloads = window.prompt("Add how many extra downloads?", "3");
    if (downloads === null) return;
    act(row, "topUp", { downloads });
  };

  if (status === "loading" || permLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("products")) {
    return (
      <PermissionGate
        perm="products"
        what="products"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 px-4 py-6 lg:px-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold admin-text-primary">
          Customer Downloads
          <span className="rounded-full bg-[#EAF4FF] px-2.5 py-1 text-xs font-bold text-[#2C5282]">{meta.total}</span>
        </h1>
        <p className="mt-1 text-xs admin-text-muted">
          Every download entitlement the store has issued. Revoke a leaked purchase, extend access, or add downloads for
          a customer who ran out.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          ariaLabel="Filter entitlements"
          options={FILTERS}
          value={filter}
          onChange={(v) => { setFilter(v); setPage(1); }}
        />
        <label className="sm:w-80">
          <span className="sr-only">Search downloads</span>
          <input
            type="search"
            className={inputCls}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Customer, email, product, order or licence key"
          />
        </label>
      </div>

      {failed && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-bold text-rose-900">Couldn&apos;t load downloads.</p>
          <button onClick={load} className="mt-2 rounded-lg bg-rose-900 px-3 py-1.5 text-xs font-bold text-white">
            Try again
          </button>
        </div>
      )}

      {!failed && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-black/10 bg-white py-14 text-center">
          <p className="text-sm font-bold admin-text-primary">
            {q || filter !== "all" ? "Nothing matches that" : "No downloads issued yet"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs admin-text-muted">
            {q || filter !== "all"
              ? "Try a different search or filter."
              : "Entitlements appear here as soon as a customer pays for a product with a download attached."}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-black/5 bg-white">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-black/5 text-[11px] uppercase tracking-wide admin-text-muted">
              <tr>
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">Downloads</th>
                <th className="px-4 py-3 font-bold">Access</th>
                <th className="px-4 py-3 font-bold">Last used</th>
                <th className="px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.015]">
                  <td className="px-4 py-3">
                    <p className="font-bold admin-text-primary">{row.customerName || "Guest"}</p>
                    <p className="text-[11px] admin-text-muted">{row.customerEmail || "—"}</p>
                    {row.isGuest && (
                      <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        Guest
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold admin-text-primary">{row.productName}</p>
                    <Link
                      href={`/admin/orders/${row.orderId}`}
                      className="text-[11px] font-bold text-accent hover:underline"
                    >
                      #{row.orderNumber || "order"}
                    </Link>
                    <p className="text-[11px] admin-text-muted">{fmtDate(row.purchasedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold admin-text-primary">
                      {row.downloadLimit > 0 ? `${row.downloadCount} of ${row.downloadLimit}` : `${row.downloadCount}`}
                    </p>
                    <p className="text-[11px] admin-text-muted">
                      {row.downloadsRemaining === null ? "Unlimited" : `${row.downloadsRemaining} left`}
                    </p>
                    {/* An abuse signal, not a verdict — the number of distinct
                        addresses that have actually pulled this purchase. */}
                    {row.distinctIps > 3 && (
                      <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        {row.distinctIps} IPs
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.revoked ? (
                      <>
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">Revoked</span>
                        {row.revokedReason && (
                          <p className="mt-0.5 max-w-[180px] text-[11px] admin-text-muted">{row.revokedReason}</p>
                        )}
                      </>
                    ) : row.blocked === "denied_expired" ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        Expired {fmtDate(row.expiresAt)}
                      </span>
                    ) : row.blocked === "denied_limit" ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        Used up
                      </span>
                    ) : (
                      <>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          Active
                        </span>
                        <p className="mt-0.5 text-[11px] admin-text-muted">
                          {row.expiresAt ? `Until ${fmtDate(row.expiresAt)}` : "No expiry"}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] admin-text-muted">{fmtDateTime(row.lastDownloadAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => showLog(row)}
                        className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-bold admin-text-primary hover:bg-black/5"
                      >
                        History
                      </button>
                      {row.revoked ? (
                        <button
                          onClick={() => act(row, "restore")}
                          className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => revoke(row)}
                          className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                        >
                          Revoke
                        </button>
                      )}
                      {/* Extending or topping up a revoked entitlement does
                          nothing the customer can use — restore it first. */}
                      {!row.revoked && row.expiresAt && (
                        <button
                          onClick={() => extend(row)}
                          className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-bold admin-text-primary hover:bg-black/5"
                        >
                          Extend
                        </button>
                      )}
                      {!row.revoked && row.downloadLimit > 0 && (
                        <button
                          onClick={() => topUp(row)}
                          className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-bold admin-text-primary hover:bg-black/5"
                        >
                          Add downloads
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs admin-text-muted">
            Page {meta.page} of {meta.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-bold admin-text-primary disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-bold admin-text-primary disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {openLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Download history"
          onClick={() => setOpenLog(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold admin-text-primary">Download history</h3>
                <p className="truncate text-xs admin-text-muted">
                  {openLog.productName} · {openLog.customerEmail || "Guest"} · #{openLog.orderNumber}
                </p>
              </div>
              <button onClick={() => setOpenLog(null)} className="text-sm font-bold admin-text-muted hover:text-ink">
                Close
              </button>
            </div>

            {logLoading ? (
              <p className="py-8 text-center text-xs admin-text-muted">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="py-8 text-center text-xs admin-text-muted">
                No download attempts recorded for this purchase yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {logs.map((l) => (
                  <li key={l.id} className="rounded-lg border border-black/5 bg-black/[0.015] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          OUTCOME_STYLES[l.outcome] || "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {OUTCOME_LABELS[l.outcome] || l.outcome}
                      </span>
                      <span className="text-xs font-semibold admin-text-primary">{l.fileName || "—"}</span>
                      {l.isPreview && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          Preview
                        </span>
                      )}
                      <span className="ml-auto text-[11px] admin-text-muted">{fmtDateTime(l.at)}</span>
                    </div>
                    <p className="mt-1 text-[11px] admin-text-muted">
                      {l.ip || "no IP"}
                      {l.userAgent ? ` · ${l.userAgent}` : ""}
                    </p>
                    {l.detail && <p className="mt-0.5 text-[11px] admin-text-muted">{l.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
