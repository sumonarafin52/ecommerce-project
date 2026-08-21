// components/profile/PaymentMethodsPanel.jsx
"use client";

import { useEffect, useState } from "react";

const inputCls =
  "w-full bg-cream-white border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder-ink-muted outline-none focus:border-indigo-900 transition-colors";
const labelCls = "block text-[12px] font-bold text-ink-soft mb-1.5";

const WALLETS = [
  { id: "", label: "None" },
  { id: "bkash", label: "bKash" },
  { id: "nagad", label: "Nagad" },
  { id: "rocket", label: "Rocket" },
];

export default function PaymentMethodsPanel() {
  const [pref, setPref] = useState({ defaultMethod: "cod", walletProvider: "", walletNumber: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch("/api/account/payment-preference")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setPref(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/account/payment-preference", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pref),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setPref(res.data);
      setMsg({ type: "ok", text: "Payment preferences saved." });
    } catch (err) {
      setMsg({ type: "bad", text: err.message || "Failed to save" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-cream-white border border-line rounded-xl p-6 flex items-center justify-center py-14">
        <div className="w-7 h-7 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="bg-cream-white border border-line rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-[17px] font-bold text-ink">Payment Methods</h3>
        <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
          🔒 For your security, we never ask for or store your card number, CVV, or wallet PIN. Card and mobile banking
          payments are entered directly on SSLCommerz's secure payment page — we only save your checkout preference below.
        </p>
      </div>

      {msg && (
        <p
          className={`text-sm font-semibold rounded-lg px-4 py-3 border ${
            msg.type === "ok" ? "text-green-700 bg-green-50 border-green-200" : "text-brick bg-brick/5 border-brick/20"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div>
        <label className={labelCls}>Default payment method at checkout</label>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            { id: "cod", label: "Cash on Delivery", icon: "💵" },
            { id: "sslcommerz", label: "Card / Mobile Banking (SSLCommerz)", icon: "💳" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPref((p) => ({ ...p, defaultMethod: m.id }))}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 border-[1.5px] transition-colors text-left ${
                pref.defaultMethod === m.id ? "border-indigo-900 bg-indigo-100/50" : "border-line hover:border-indigo-700/40"
              }`}
            >
              <span className="text-lg">{m.icon}</span>
              <span className="text-sm font-bold text-ink">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Mobile wallet number (for your reference)</label>
        <div className="grid sm:grid-cols-[140px_1fr] gap-2">
          <select
            className={inputCls}
            value={pref.walletProvider}
            onChange={(e) => setPref((p) => ({ ...p, walletProvider: e.target.value }))}
          >
            {WALLETS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder="01XXXXXXXXX"
            value={pref.walletNumber}
            disabled={!pref.walletProvider}
            onChange={(e) => setPref((p) => ({ ...p, walletNumber: e.target.value }))}
          />
        </div>
        <p className="text-[11px] text-ink-muted mt-1.5">
          Saved as a personal reminder only — it's never used to charge you or sent anywhere automatically.
        </p>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-indigo-900 hover:bg-indigo-950 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </form>
  );
}
