// components/admin/ui/Badge.jsx
// Shared status badge. `tone` picks a semantic color family — keep these
// consistent everywhere instead of inventing new color combos per page.
const TONES = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
  info: "bg-blue-100 text-blue-700",
  accent: "bg-accent/10 text-accent",
};

export default function Badge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
