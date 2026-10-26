// components/product/Rating.jsx
//
// The one star row.
//
// There were three of these: the product card typed "★★★☆☆" as text, the
// product page drew its own SVG, the compare table printed a single "★" and
// the listing filter built "★★★★ & up" by repeating the character. Typed
// stars are a different shape in every system font, so the row came out
// ragged, and the hollow character is often a different weight from the
// filled one — which made a 3-star product look like it had been rated in
// two different units.
import Icon from "@/components/ui/Icon";

/**
 * `value` is the 0–5 average. `count` adds the number of reviews beside it.
 * Rounded to the nearest whole star, which is what every star row in the
 * shop has always shown — half stars would imply a precision the rating
 * does not have.
 */
export default function Rating({ value = 0, count, size = 13, className = "", showEmpty = true }) {
  const filled = Math.round(Number(value) || 0);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="flex items-center gap-px" aria-label={`Rated ${Number(value || 0).toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => {
          if (!showEmpty && n > filled) return null;
          return (
            <Icon
              key={n}
              name="star"
              size={size}
              strokeWidth={1.4}
              className={n <= filled ? "fill-gold text-gold" : "text-line"}
            />
          );
        })}
      </span>
      {count !== undefined && <span className="text-[11px] text-ink-muted tabular-nums">({count})</span>}
    </span>
  );
}
