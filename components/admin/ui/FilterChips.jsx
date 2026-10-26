// components/admin/ui/FilterChips.jsx
//
// A row of mutually-exclusive filters with one active — the control at the
// top of Stock history, Restock, Product performance, Abandoned baskets,
// Downloads and Reports.
//
// It existed five times. Four of those were a pill (`rounded-full`, bordered,
// accent fill when active); Downloads was a square-cornered chip with no
// border and a white fill; Reports was a pill but tinted `bg-accent/15` with
// accent text instead of filling. Same control, three looks, measured at
// 28px and 30px tall. The pill is what most of them already were and what
// the newest pages use, so that is what this is.
//
// The joined "sandbox / live" switch in Settings → Payment is deliberately
// not this: it is a two-state toggle inside a bordered box, not a filter row.
export default function FilterChips({ options, value, onChange, className = "", ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {options.map((o) => {
        const key = o.key ?? o.value ?? o.label;
        const active = (o.key ?? o.value) === value;
        return (
          <button
            key={String(key)}
            type="button"
            onClick={() => onChange(o.key ?? o.value)}
            aria-pressed={active}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              active
                ? "bg-accent border-accent text-white"
                : "admin-border admin-text-secondary hover:text-accent hover:border-accent"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className={`ml-1.5 tabular-nums ${active ? "opacity-80" : "admin-text-muted"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
