// components/admin/ui/Checkbox.jsx
//
// One checkbox for the whole admin.
//
// There were five of these. `accent-[#f5a623] w-4 h-4` in the orders,
// products, discounts and customers tables — a hard-coded orange that is
// not the brand accent (#C98A2B) and matches nothing else on the page;
// `accent-indigo-600` in Notifications and Tax; `w-4 h-4 accent-accent` in
// General and Email; and bare `<input type="checkbox">` in Shipping,
// General, Tax and Digital, which renders as the browser default and looks
// like it came from a different application. Same control, four tick
// colours, two sizes.
//
// The box itself stays 16px, which is what the design wants visually, but
// the clickable area is 24px — WCAG 2.2 Target Size (Minimum) asks for 24,
// and the row-select boxes in the orders table measured exactly 16x16. The
// extra 8px is taken back with a negative margin, so a table cell lays out
// as it did before while the thing you have to hit grew by half. The label
// is inside the <label>, so its text is part of that target too.
export default function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  // Full-width row rather than an inline control — for stacked lists of
  // options, where each one should take its own line.
  block = false,
  // The denser label used in card headers and table rows, where the
  // checkbox sits beside other row controls rather than in a form.
  compact = false,
  className = "",
  ...rest
}) {
  return (
    <label
      className={`${block ? "flex w-full" : "inline-flex"} gap-2 select-none ${
        hint ? "items-start" : "items-center"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <span className="inline-grid place-items-center w-6 h-6 -m-1 shrink-0 rounded-md transition-colors hover:bg-black/[0.06]">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked, e)}
          className="w-4 h-4 accent-accent disabled:cursor-not-allowed"
          {...rest}
        />
      </span>
      {label && (
        <span className="min-w-0">
          <span
            className={compact ? "text-xs font-bold admin-text-secondary" : "text-sm admin-text-primary"}
          >
            {label}
          </span>
          {hint && <span className="block text-[11px] admin-text-muted">{hint}</span>}
        </span>
      )}
    </label>
  );
}
