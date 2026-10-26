// components/admin/ui/FormField.jsx
// Shared settings-form primitives, originally written inline in
// Settings → General and promoted here once Payment Methods needed the
// exact same pieces. Keep using these for Billing/Shipping too instead of
// re-declaring local copies per page.
import Button from "@/components/admin/ui/Button";

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
      className={`admin-input w-full ${props.className || ""}`}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`admin-input w-full ${props.className || ""}`}
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
          <Button variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
