// app/admin/settings/pages/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/admin/ui/PageHeader";
import { SaveBar } from "@/components/admin/ui/FormField";
import usePermissions from "@/lib/usePermissions";
import { INFO_PAGES, INFO_PAGE_KEYS } from "@/lib/pageTemplates";
import { renderSimpleMarkdown, fillPlaceholders } from "@/lib/simpleMarkdown";
import { RETURN_WINDOW_DAYS } from "@/lib/policyConstants";
import PermissionGate from "@/components/admin/ui/PermissionGate";

export default function AdminPagesSettings() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const [pages, setPages] = useState(null);
  const [general, setGeneral] = useState({});
  const [active, setActive] = useState("about");
  const [mode, setMode] = useState("edit");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return;
        const stored = res.data.pages || {};
        // show the template in the editor when nothing custom is saved yet
        setPages(Object.fromEntries(INFO_PAGE_KEYS.map((k) => [k, stored[k]?.trim() ? stored[k] : INFO_PAGES[k].template])));
        setGeneral(res.data.general || {});
        setDirty(false);
      });

  useEffect(() => {
    if (!permLoading && can("settings")) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const preview = useMemo(() => {
    if (!pages) return "";
    return renderSimpleMarkdown(
      fillPlaceholders(pages[active], {
        storeName: general.storeName || "our store",
        storeEmail: general.storeEmail,
        storePhone: general.storePhone,
        storeAddress: general.storeAddress,
        returnDays: RETURN_WINDOW_DAYS,
      })
    );
  }, [pages, active, general]);

  const save = async () => {
    setSaving(true);
    try {
      // an unchanged template is saved as "" so future template improvements
      // still reach pages the owner never customised
      const body = Object.fromEntries(INFO_PAGE_KEYS.map((k) => [k, pages[k] === INFO_PAGES[k].template ? "" : pages[k]]));
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: body }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Pages saved");
      setDirty(false);
    } catch (err) {
      toast.error(err.message || "Couldn't save");
    }
    setSaving(false);
  };
  if (permLoading || permFailed || !can("settings")) {
    return (
      <PermissionGate
        perm="settings"
        what="store settings"
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  const missing = ["storeEmail", "storePhone", "storeAddress"].filter((k) => !general[k]);

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 pb-24">
      <PageHeader
        title="Store Pages"
        description="About Us and your store policies. Payment providers usually check these before approving a live account."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3 mb-5">
        These start from templates written to match how this store works (payments, returns, cancellations,
        delivery tracking). <b>Review them and adapt them to your business</b> — they&apos;re a starting point, not legal advice.
        {missing.length > 0 && (
          <span className="block mt-1.5">
            Tip: add your store {missing.map((m) => m.replace("store", "").toLowerCase()).join(", ")} in Settings → General — lines that
            mention missing details are hidden automatically.
          </span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b admin-border mb-4">
        {INFO_PAGE_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === k ? "border-accent text-accent" : "border-transparent admin-text-secondary"
            }`}
          >
            {INFO_PAGES[k].title}
          </button>
        ))}
      </div>

      {!pages ? (
        <div className="admin-card rounded-xl h-96 animate-pulse" />
      ) : (
        <div className="admin-card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b admin-border">
            <div className="flex gap-1 text-xs font-bold">
              {["edit", "preview"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md capitalize ${mode === m ? "bg-accent text-white" : "admin-text-secondary"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <a href={INFO_PAGES[active].path} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent hover:underline">
                View live page ↗
              </a>
              <button
                onClick={() => {
                  if (!window.confirm("Replace this page with the original template?")) return;
                  setPages((p) => ({ ...p, [active]: INFO_PAGES[active].template }));
                  setDirty(true);
                }}
                className="text-xs font-bold admin-text-secondary hover:text-rose-600"
              >
                Reset to template
              </button>
            </div>
          </div>

          {mode === "edit" ? (
            <textarea
              value={pages[active]}
              onChange={(e) => {
                setPages((p) => ({ ...p, [active]: e.target.value }));
                setDirty(true);
              }}
              rows={24}
              maxLength={20000}
              spellCheck
              className="w-full p-4 font-mono text-[13px] leading-relaxed admin-text-primary bg-transparent outline-none resize-y"
            />
          ) : (
            <div className="p-6 bg-[#FFFCF6]">
              <div className="info-prose max-w-3xl" dangerouslySetInnerHTML={{ __html: preview }} />
            </div>
          )}

          <div className="px-4 py-3 border-t admin-border text-[11.5px] admin-text-muted leading-relaxed">
            <b>Formatting:</b> <code>## Heading</code> · <code>- bullet</code> · <code>1. numbered</code> · <code>**bold**</code> ·{" "}
            <code>[link text](/contact)</code> · blank line = new paragraph. <b>Auto-filled:</b> <code>{"{{storeName}}"}</code>{" "}
            <code>{"{{storeEmail}}"}</code> <code>{"{{storePhone}}"}</code> <code>{"{{storeAddress}}"}</code>{" "}
            <code>{"{{returnDays}}"}</code>
          </div>
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={load} />
    </div>
  );
}
