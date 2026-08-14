// components/admin/ui/Toggle.jsx
// Same peer-checkbox switch technique already used in ProductForm.jsx,
// re-themed with the admin-border/accent tokens so it matches the rest of
// the Settings design system. Use for any enable/disable state.
export default function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="sr-only peer"
        />
        <span className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-accent transition-colors" />
        <span className="absolute left-0.5 top-0.5 bg-white rounded-full h-4 w-4 transition-all peer-checked:translate-x-4 shadow-sm" />
      </span>
      {label && <span className="text-sm font-semibold admin-text-primary">{label}</span>}
    </label>
  );
}
