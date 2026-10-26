// components/admin/ui/Button.jsx
//
// The admin's buttons.
//
// Measured across 26 pages, the primary action button — "+ Create Order",
// "Save tax settings", "+ Add Product", "Save Access", "Create digital
// product" — came in NINE shapes: 32, 36, 40, 42 and 48px tall, 6px and 8px
// corners, 12/14/16px text, weight 700 and 800, two of them gradient-filled.
// They all do the same job and they should look like the same control.
//
// Variants are by meaning, not by colour, so a page asks for "the dangerous
// one" rather than picking a red. Sizes are two: `md` for page and form
// actions, `sm` for a button sitting inside a table row or a card header.
//
// `as` renders a Link or an <a> while keeping the styling — a button that
// navigates is still a button to look at.
const BASE =
  "inline-flex items-center justify-center gap-1.5 font-bold rounded-lg transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

const SIZES = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
  // No fill, so no padding to speak of — but still 24px of height to hit.
  link: "h-6 text-xs",
};

const VARIANTS = {
  // The one action a page most wants you to take.
  primary: "bg-accent text-white hover:bg-accent/90",
  // Everything alongside it.
  secondary: "bg-white admin-text-primary border admin-border hover:border-accent hover:text-accent",
  // Destructive: deleting, revoking, cancelling. Same red as Badge's danger
  // tone, which is what the resulting state will be labelled with.
  danger: "bg-white text-[#8E0B21] border border-[#8E0B21]/30 hover:bg-[#FEDAD9]",
  // No chrome until you reach for it — for a tertiary action in a dense row.
  ghost: "admin-text-secondary hover:bg-black/[0.06] hover:admin-text-primary",
  // Reads as a link, behaves as a button: "Test connection", "Edit address",
  // "Show as table". These were written as bare text and measured 16–17px
  // tall, under the 24px WCAG 2.2 asks of a target. The `link` size keeps
  // them visually inline while giving them a 24px box to hit.
  link: "text-accent hover:underline disabled:no-underline",
  "link-danger": "text-[#8E0B21] hover:underline disabled:no-underline",
};

export default function Button({
  as: As = "button",
  variant = "primary",
  size = "md",
  full = false,
  className = "",
  children,
  ...rest
}) {
  // `link` carries its own size: asking for variant="link" and leaving size
  // alone should not give it the padding of a filled button.
  const resolvedSize = variant.startsWith("link") && size === "md" ? "link" : size;
  const cls = `${BASE} ${SIZES[resolvedSize] || SIZES.md} ${VARIANTS[variant] || VARIANTS.primary} ${
    full ? "w-full" : ""
  } ${className}`;
  // A <button> with no explicit type submits the form it is inside, which is
  // rarely what a toolbar button wants.
  const typeProp = As === "button" && rest.type === undefined ? { type: "button" } : null;
  return (
    <As className={cls} {...typeProp} {...rest}>
      {children}
    </As>
  );
}
