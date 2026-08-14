// components/admin/ui/FormField.jsx
// Shared settings-form primitives, originally written inline in
// Settings → General and promoted here once Payment Methods needed the
// exact same pieces. Keep using these for Billing/Shipping too instead of
// re-declaring local copies per page.

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-bold admin-text-secondary mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="text-[11px] admin-text-muted mt-1 block">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none ${props.className || ""}`}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`admin-input w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-y ${props.className || ""}`}
    />
  );
}

export function SaveBar({ dirty, saving, onSave, onDiscard, label = "You have unsaved changes" }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6">
      <div className="admin-card rounded-xl px-4 py-3 flex items-center justify-between shadow-lg">
        <p className="text-sm font-bold admin-text-primary">{label}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={onDiscard}
            className="px-4 py-2 rounded-lg text-sm font-bold admin-text-secondary hover:bg-gray-100 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
