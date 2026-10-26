"use client";

// app/admin/settings/notifications/page.js
//
// Which notifications go out, over which channels, plus the SMS gateway and
// a log of what actually happened.
//
// The matrix is the point: before this, every notification went in-app and
// by email and there was no way to change it. SMS costs money per message,
// so it's opt-in per event rather than a single switch that starts texting
// customers about product questions.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import usePermissions from "@/lib/usePermissions";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import Checkbox from "@/components/admin/ui/Checkbox";
import Button from "@/components/admin/ui/Button";
import FilterChips from "@/components/admin/ui/FilterChips";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const inputCls = "admin-input w-full";
const LOG_CHANNELS = [
  { key: "", label: "All" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "inApp", label: "In-app" },
];
const labelCls = "block text-[11px] font-bold uppercase tracking-wide admin-text-muted mb-1.5";
const MASK = "••••••••";

const CHANNELS = [
  ["inApp", "In-app"],
  ["email", "Email"],
  ["sms", "SMS"],
];

function fmt(d) {
  return d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function NotificationSettingsPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  const [loadError, setLoadError] = useState(false);
  const [logError, setLogError] = useState(false);

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState(null);
  const [logFilter, setLogFilter] = useState("");
  const [testTo, setTestTo] = useState({ email: "", sms: "" });
  const [testing, setTesting] = useState("");

  const loadLog = useCallback((channel) => {
    const qs = new URLSearchParams();
    if (channel) qs.set("channel", channel);
    setLogError(false);
    fetch(`/api/admin/notifications?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setLog(res.data) : setLogError(true)))
      .catch(() => setLogError(true));
  }, []);

  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return setLoadError(true);
        const n = res.data.notifications || {};
        setConfig({
          channels: { inApp: true, email: true, sms: false, ...(n.channels || {}) },
          events: n.events || {},
          sms: {
            enabled: false,
            providerName: "",
            urlTemplate: "",
            method: "GET",
            contentType: "application/x-www-form-urlencoded",
            bodyTemplate: "",
            apiKey: "",
            senderId: "",
            ...(n.sms || {}),
          },
        });
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    loadLog("");
  }, [loadLog]);

  useEffect(() => {
    if (permLoading || status === "loading") return;
    if (status === "authenticated" && can("settings")) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, permLoading, can]);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifications: config }),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    res.success ? toast.success("Notification settings saved") : toast.error(res.message || "Couldn't save");
    setSaving(false);
  };

  const sendTest = async (channel) => {
    const to = testTo[channel];
    if (!to.trim()) return toast.error(channel === "sms" ? "Enter a phone number" : "Enter an email address");
    setTesting(channel);
    const res = await fetch("/api/admin/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, to }),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, message: "Network error" }));
    res.success ? toast.success(res.message) : toast.error(res.message || "Test failed");
    setTesting("");
    loadLog(logFilter);
  };

  const setEventChannel = (eventId, channel, value) => {
    setConfig((c) => {
      const event = NOTIFICATION_EVENTS.find((e) => e.id === eventId);
      const current = c.events[eventId] || { ...event.defaults };
      return { ...c, events: { ...c.events, [eventId]: { ...current, [channel]: value } } };
    });
  };

  if (!loadError && (status === "loading" || permLoading || loading || (can("settings") && !config))) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("settings")) {
    return (
      <PermissionGate
        perm="settings"
        what="store settings"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="notification settings" onRetry={() => { setLoadError(false); load(); }} />;
  }

  const smsOff = !config.channels.sms;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-8">
      <div>
        <nav className="text-xs admin-text-muted">
          <Link href="/admin/settings" className="hover:underline">
            Settings
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-bold admin-text-primary">Notifications</span>
        </nav>
        <h1 className="mt-2 text-2xl font-bold admin-text-primary">Notifications</h1>
        <p className="mt-1 text-xs admin-text-muted">
          Choose what the store tells customers, and how it reaches them.
        </p>
      </div>

      {/* ===== channels ===== */}
      <div className="admin-card space-y-4 rounded-2xl p-6">
        <h2 className="text-base font-extrabold admin-text-primary">Channels</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CHANNELS.map(([key, label]) => (
            <Checkbox
              key={key}
              block
              className={`rounded-xl border-2 p-3 transition-colors ${
                config.channels[key] ? "border-accent bg-accent/10" : "border-black/10 bg-white"
              }`}
              checked={!!config.channels[key]}
              onChange={(on) => setConfig((c) => ({ ...c, channels: { ...c.channels, [key]: on } }))}
              label={<span className="font-bold">{label}</span>}
              hint={
                key === "inApp"
                  ? "Shown in the customer's account. Free, and account holders only."
                  : key === "email"
                  ? "Needs SMTP under Settings → Email."
                  : "Needs a gateway below. Costs money per message."
              }
            />
          ))}
        </div>
        <p className="text-[11px] admin-text-muted">
          Switching a channel off here stops it everywhere, whatever the table below says.
        </p>
      </div>

      {/* ===== per-event matrix ===== */}
      <div className="admin-card rounded-2xl p-6">
        <h2 className="text-base font-extrabold admin-text-primary">What gets sent</h2>
        <p className="mt-0.5 text-xs admin-text-muted">
          SMS is only offered for the events worth paying for — the ones a customer is waiting on.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-black/5 text-[11px] uppercase tracking-wide admin-text-muted">
              <tr>
                <th className="py-2 font-bold">Event</th>
                {CHANNELS.map(([, label]) => (
                  <th key={label} className="w-20 py-2 text-center font-bold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_EVENTS.map((ev) => {
                const row = config.events[ev.id] || ev.defaults;
                return (
                  <tr key={ev.id} className="border-b border-black/5 last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold admin-text-primary">
                        {ev.label}
                        {ev.audience === "staff" && (
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            staff
                          </span>
                        )}
                      </p>
                      {ev.description && <p className="text-[11px] admin-text-muted">{ev.description}</p>}
                    </td>
                    {CHANNELS.map(([key]) => {
                      // SMS is hidden for events it shouldn't carry, and
                      // greyed when the channel itself is off — rather than
                      // offering a switch that does nothing.
                      const unavailable = key === "sms" && (!ev.smsWorthy || smsOff);
                      return (
                        <td key={key} className="py-2.5 text-center">
                          {unavailable ? (
                            <span
                              className="text-[11px] admin-text-muted"
                              title={!ev.smsWorthy ? "Not worth a text message" : "Turn the SMS channel on first"}
                            >
                              —
                            </span>
                          ) : (
                            <Checkbox
                              aria-label={`${ev.label} by ${key}`}
                              checked={!!row[key]}
                              onChange={(on) => setEventChannel(ev.id, key, on)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== SMS gateway ===== */}
      <div className="admin-card space-y-4 rounded-2xl p-6">
        <div>
          <h2 className="text-base font-extrabold admin-text-primary">SMS gateway</h2>
          <p className="mt-0.5 text-xs admin-text-muted">
            Most Bangladeshi bulk-SMS providers take one HTTP request. Paste the one your provider documented and put{" "}
            <code className="rounded bg-black/5 px-1">{"{to}"}</code> and{" "}
            <code className="rounded bg-black/5 px-1">{"{text}"}</code> where the number and message go;{" "}
            <code className="rounded bg-black/5 px-1">{"{apiKey}"}</code> and{" "}
            <code className="rounded bg-black/5 px-1">{"{senderId}"}</code> are filled from the fields below.
          </p>
        </div>

        <Checkbox
          checked={!!config.sms.enabled}
          onChange={(on) => setConfig((c) => ({ ...c, sms: { ...c.sms, enabled: on } }))}
          label={<span className="font-bold">Gateway configured and active</span>}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Provider name (your reference)</label>
            <input
              className={inputCls}
              value={config.sms.providerName}
              onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, providerName: e.target.value } }))}
              placeholder="Alpha SMS"
            />
          </div>
          <div>
            <label className={labelCls}>Sender ID / mask</label>
            <input
              className={inputCls}
              value={config.sms.senderId}
              onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, senderId: e.target.value } }))}
              placeholder="SumonShop"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Request URL *</label>
          <input
            className={`${inputCls} font-mono text-xs`}
            value={config.sms.urlTemplate}
            onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, urlTemplate: e.target.value } }))}
            placeholder="https://api.example.net/sendsms?api_key={apiKey}&sender={senderId}&to={to}&msg={text}"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>API key</label>
            <input
              type="password"
              className={inputCls}
              value={config.sms.apiKey}
              onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, apiKey: e.target.value } }))}
              placeholder={config.sms.apiKey === MASK ? MASK : "Your provider's key"}
            />
            <p className="mt-1 text-[11px] admin-text-muted">Stored encrypted. Leave as-is to keep the current key.</p>
          </div>
          <div>
            <label className={labelCls}>Method</label>
            <select
              className={inputCls}
              value={config.sms.method}
              onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, method: e.target.value } }))}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
        </div>

        {config.sms.method === "POST" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Content type</label>
              <input
                className={inputCls}
                value={config.sms.contentType}
                onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, contentType: e.target.value } }))}
              />
            </div>
            <div>
              <label className={labelCls}>Request body</label>
              <input
                className={`${inputCls} font-mono text-xs`}
                value={config.sms.bodyTemplate}
                onChange={(e) => setConfig((c) => ({ ...c, sms: { ...c.sms, bodyTemplate: e.target.value } }))}
                placeholder='{"api_key":"{apiKey}","to":"{to}","msg":"{text}"}'
              />
            </div>
          </div>
        )}

        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          If your provider needs something this can&apos;t express — a login step, a signed payload — this won&apos;t
          work for them and they&apos;d need their own integration. Use the test below to find out before customers do.
        </p>
      </div>

      {/* ===== test sends ===== */}
      <div className="admin-card space-y-4 rounded-2xl p-6">
        <div>
          <h2 className="text-base font-extrabold admin-text-primary">Send a test</h2>
          <p className="mt-0.5 text-xs admin-text-muted">
            A real message, to you. Save your changes first — the test uses what&apos;s stored.
          </p>
        </div>
        {CHANNELS.filter(([k]) => k !== "inApp").map(([key, label]) => (
          <div key={key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className={labelCls}>{label}</label>
              <input
                className={inputCls}
                value={testTo[key]}
                onChange={(e) => setTestTo((t) => ({ ...t, [key]: e.target.value }))}
                placeholder={key === "sms" ? "01711223344" : "you@example.com"}
              />
            </div>
            <button
              onClick={() => sendTest(key)}
              disabled={testing === key}
              className="rounded-lg border border-black/10 px-4 py-2.5 text-xs font-bold admin-text-primary hover:bg-black/5 disabled:opacity-50"
            >
              {testing === key ? "Sending…" : `Send test ${label.toLowerCase()}`}
            </button>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save notification settings"}
      </Button>

      {/* ===== delivery log ===== */}
      <div className="admin-card rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold admin-text-primary">Delivery log</h2>
            <p className="mt-0.5 text-xs admin-text-muted">
              What the store actually sent.
              {log?.failedLast7Days > 0 && (
                <span className="ml-1 font-bold text-rose-700">
                  {log.failedLast7Days} failed in the last 7 days.
                </span>
              )}
            </p>
          </div>
          <FilterChips
            ariaLabel="Filter the delivery log by channel"
            options={LOG_CHANNELS}
            value={logFilter}
            onChange={(v) => { setLogFilter(v); loadLog(v); }}
          />
        </div>

        {logError ? (
          /* "Nothing sent yet" and "we couldn't read the log" look identical
             to a shop owner, and only one of them means their notifications
             are working. */
          <div className="mt-4 rounded-lg border border-dashed border-black/10 py-8 text-center">
            <p className="text-xs admin-text-muted">Couldn&apos;t load the delivery log.</p>
            <Button variant="link" className="mt-1" onClick={() => loadLog(logFilter)}>
              Try again
            </Button>
          </div>
        ) : !log?.rows?.length ? (
          <p className="mt-4 rounded-lg border border-dashed border-black/10 py-8 text-center text-xs admin-text-muted">
            Nothing sent yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-1.5">
            {log.rows.slice(0, 20).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/[0.02] px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    r.sent ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {r.sent ? "sent" : "failed"}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                  {r.channel}
                </span>
                <span className="text-xs font-semibold admin-text-primary">{r.title || r.event}</span>
                <span className="text-[11px] admin-text-muted">{r.recipient}</span>
                <span className="ml-auto text-[11px] admin-text-muted">{fmt(r.at)}</span>
                {!r.sent && r.reason && (
                  <p className="w-full text-[11px] text-rose-800">{r.reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
