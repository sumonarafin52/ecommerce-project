// components/admin/ui/Badge.jsx
// Shared status badge. `tone` picks a semantic color family — keep these
// consistent everywhere instead of inventing new color combos per page.
const TONES = {
  // Polaris badge palette — soft fills, dark readable text
  neutral: "bg-[#E3E3E3] text-[#616161]",
  success: "bg-[#CDFEE1] text-[#0C5132]",
  warning: "bg-[#FFEF9D] text-[#4F4700]",
  danger: "bg-[#FEDAD9] text-[#8E0B21]",
  info: "bg-[#E0F0FF] text-[#00527C]",
  accent: "bg-[#EAF4FF] text-[#2C5282]",
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
