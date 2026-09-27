// components/profile/ReturnRequestModal.jsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";

const REASONS = [
  ["damaged", "Arrived damaged"],
  ["wrong_item", "Wrong item sent"],
  ["not_as_described", "Not as described"],
  ["size_fit", "Size or fit issue"],
  ["changed_mind", "Changed my mind"],
  ["other", "Other"],
];

/**
 * @param returnable  order lines with `remaining` = units still eligible
 */
export default function ReturnRequestModal({ order, returnable, onClose, onSubmitted }) {
  const [qty, setQty] = useState(() => Object.fromEntries(returnable.map((l) => [l.key, 0])));
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = returnable.filter((l) => qty[l.key] > 0);
  const refund = chosen.reduce((s, l) => s + l.price * qty[l.key], 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen.length) return toast.error("Choose at least one item to return");
    if (!reason) return toast.error("Please choose a reason");
    setBusy(true);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order._id,
          items: chosen.map((l) => ({ product: String(l.product), combinationKey: l.combinationKey || "", quantity: qty[l.key] })),
          reason,
          details,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success("Return requested — we'll review it shortly");
      onSubmitted();
    } catch (err) {
      toast.error(err.message || "Couldn't submit your request");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-cream-white border border-line rounded-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-fade-up"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Request a return</h2>
            <p className="text-xs text-ink-muted mt-0.5">Order #{order.orderNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink text-lg" aria-label="Close">
            ✕
          </button>
        </div>

        <div>
          <p className="text-[12px] font-bold text-ink-soft mb-2">Which items?</p>
          <div className="space-y-2">
            {returnable.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3 border border-line rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{l.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {formatCurrency(l.price)} each · {l.remaining} returnable
                  </p>
                </div>
                <div className="flex items-center border-[1.5px] border-line rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setQty((q) => ({ ...q, [l.key]: Math.max(0, q[l.key] - 1) }))}
                    className="w-8 h-8 font-bold text-ink-soft hover:bg-cream-alt"
                    aria-label="Fewer"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{qty[l.key]}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => ({ ...q, [l.key]: Math.min(l.remaining, q[l.key] + 1) }))}
                    className="w-8 h-8 font-bold text-ink-soft hover:bg-cream-alt"
                    aria-label="More"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-bold text-ink-soft mb-2">Why are you returning it?</p>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setReason(value)}
                className={`text-left text-[13px] font-semibold rounded-lg px-3 py-2.5 border-[1.5px] transition-colors ${
                  reason === value ? "border-indigo-900 bg-indigo-100/50 text-indigo-950" : "border-line text-ink-soft hover:border-indigo-700/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-bold text-ink-soft mb-1.5">
            Anything else we should know? <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="e.g. the box was crushed and the screen is cracked"
            className="w-full border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-indigo-900 transition-colors"
          />
        </div>

        {refund > 0 && (
          <div className="flex justify-between items-center bg-cream-alt/60 rounded-lg px-4 py-3">
            <span className="text-sm text-ink-soft">Refund if approved</span>
            <span className="font-display text-lg font-bold text-indigo-900">{formatCurrency(refund)}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border-[1.5px] border-line text-ink-soft hover:border-indigo-700/50 font-bold py-2.5 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}
