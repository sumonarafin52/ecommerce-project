"use client";

// components/DigitalDownloads.jsx
//
// One list of purchased digital files, used by the profile order list, the
// order confirmation page and the dedicated "My Downloads" page — rather
// than three separate download UIs that drift apart.
//
// The two-step download is deliberate and can't be shortcut from here:
//   1. POST /api/downloads/{grantId}  → spends one download, returns a token
//      that lives about two minutes
//   2. navigate to /api/downloads/file?token=…  → the server streams the
//      bytes
//
// The component never sees a storage URL, so there's nothing in the page
// source, the network tab or a saved copy that keeps working later.
import { useState } from "react";

function formatSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export default function DigitalDownloads({ grants = [], guestToken = "", compact = false, onChange }) {
  // keyed `${grantId}:${fileId}` so two files in one product can't both spin
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState({});
  const [copied, setCopied] = useState("");

  if (!grants.length) return null;

  const download = async (grant, file) => {
    const key = `${grant.id}:${file.id}`;
    setBusy(key);
    setErrors((e) => ({ ...e, [grant.id]: "" }));

    try {
      const qs = guestToken ? `?t=${encodeURIComponent(guestToken)}` : "";
      const res = await fetch(`/api/downloads/${grant.id}${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.success) {
        setErrors((e) => ({
          ...e,
          [grant.id]: json?.message || "We couldn't start that download. Please try again.",
        }));
        return;
      }

      // Delivered through a hidden iframe rather than window.location.
      //
      // A successful response carries Content-Disposition: attachment, so
      // either way the browser downloads rather than navigating. But if the
      // file can't be fetched from storage, the server answers with a JSON
      // error — and with window.location that error REPLACED the page the
      // customer was on, dumping them on raw JSON. In an iframe the failure
      // is invisible and the page survives, so they can simply try again.
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.src = `/api/downloads/file?token=${encodeURIComponent(json.data.token)}`;
      document.body.appendChild(frame);
      setTimeout(() => frame.remove(), 120_000);

      // let the parent refresh the remaining-downloads count
      if (onChange) onChange(grant.id, json.data);
    } catch {
      setErrors((e) => ({ ...e, [grant.id]: "Network problem — please check your connection and try again." }));
    } finally {
      setBusy("");
    }
  };

  const copyKey = async (grant) => {
    try {
      await navigator.clipboard.writeText(grant.licenseKey);
      setCopied(grant.id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard blocked — the key is visible on screen anyway */
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {grants.map((grant) => {
        const expiryDays = daysUntil(grant.expiresAt);
        const expiringSoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 7;
        const lowDownloads = grant.downloadsRemaining !== null && grant.downloadsRemaining <= 2;

        return (
          <div
            key={grant.id}
            className="rounded-xl border border-indigo-700/20 bg-indigo-50/60 p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-indigo-950 break-words">{grant.productName}</p>
                <p className="mt-0.5 text-[11px] text-indigo-900/70">
                  {grant.orderNumber && <span>Order #{grant.orderNumber}</span>}
                  {grant.purchasedAt && <span> · {formatDate(grant.purchasedAt)}</span>}
                  {grant.version && <span> · v{grant.version}</span>}
                </p>
              </div>

              {/* Only ever shows real numbers — "Unlimited" when no limit was
                  set, never an invented quota. */}
              <div className="text-right text-[11px] shrink-0">
                {grant.downloadsRemaining === null ? (
                  <span className="font-bold text-indigo-900">Unlimited downloads</span>
                ) : (
                  <span className={`font-bold ${lowDownloads ? "text-amber-700" : "text-indigo-900"}`}>
                    {grant.downloadsRemaining} of {grant.downloadLimit} left
                  </span>
                )}
                {grant.expiresAt && (
                  <p className={expiringSoon ? "text-amber-700 font-bold" : "text-indigo-900/70"}>
                    {expiryDays !== null && expiryDays < 0
                      ? "Access expired"
                      : `Available until ${formatDate(grant.expiresAt)}`}
                  </p>
                )}
              </div>
            </div>

            {grant.updateAvailable && (
              <p className="mt-2 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900">
                Updated version available — you bought v{grant.purchasedVersion}, current is v{grant.version}
              </p>
            )}

            {!grant.available ? (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
                {grant.blocked === "denied_limit" &&
                  "You've used all the downloads included with this purchase. Contact support if you need access again."}
                {grant.blocked === "denied_expired" &&
                  "The download period for this purchase has ended. Contact support if you need access again."}
                {grant.blocked === "denied_revoked" && "Access to this download has been withdrawn. Please contact support."}
                {!["denied_limit", "denied_expired", "denied_revoked"].includes(grant.blocked) &&
                  "This download isn't available right now. Please contact support."}
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {grant.files.map((file) => {
                  const key = `${grant.id}:${file.id}`;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => download(grant, file)}
                      disabled={busy === key}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-indigo-700/20 bg-white px-3 py-2.5 text-left transition-colors hover:bg-indigo-50 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-indigo-950">
                          {file.label || file.name}
                          {file.isPreview && (
                            <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                              Preview
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-ink-muted">
                          {file.name}
                          {file.size ? ` · ${formatSize(file.size)}` : ""}
                          {file.version ? ` · v${file.version}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-indigo-900">
                        {busy === key ? "Preparing…" : "Download ↓"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {errors[grant.id] && (
              <p role="alert" className="mt-2 rounded-lg bg-rose-100 px-2.5 py-1.5 text-[11px] font-bold text-rose-900">
                {errors[grant.id]}
              </p>
            )}

            {grant.licenseKey && (
              <div className="mt-3 rounded-lg bg-white px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Licence key</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="break-all text-xs font-bold text-ink">{grant.licenseKey}</code>
                  <button
                    type="button"
                    onClick={() => copyKey(grant)}
                    className="shrink-0 text-[11px] font-bold text-indigo-700 hover:underline"
                  >
                    {copied === grant.id ? "Copied" : "Copy"}
                  </button>
                </div>
                {grant.licenseTerms && <p className="mt-1.5 text-[11px] text-ink-muted">{grant.licenseTerms}</p>}
              </div>
            )}

            {!compact && grant.changelog?.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-bold text-indigo-800">Version history</summary>
                <ul className="mt-1.5 space-y-1">
                  {grant.changelog.map((c, i) => (
                    <li key={i} className="text-[11px] text-ink-soft">
                      <span className="font-bold">v{c.version}</span> — {c.notes}
                      {c.at && <span className="text-ink-muted"> ({formatDate(c.at)})</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
