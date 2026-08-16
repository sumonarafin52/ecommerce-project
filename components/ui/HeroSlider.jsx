// components/ui/HeroSlider.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

// customSlides: admin-configured slides from Settings → Homepage → Hero Slider
// (shape: { tag, title, subtitle, buttonText, buttonLink, image, active }).
// When provided and non-empty, these take over completely; otherwise the
// original auto-generated behavior (top-rated products) is used so nothing
// breaks for stores that haven't configured anything yet.
//
// Rendered as a "duo tile" layout (one large + one smaller promo side by
// side) matching the storefront redesign — cycles through slides two at a
// time when more than 2 are available.
export default function HeroSlider({ products = [], customSlides = [] }) {
  const activeCustom = customSlides.filter((s) => s.active !== false);

  const slides =
    activeCustom.length > 0
      ? activeCustom.map((s) => ({
          tag: s.tag || "Featured",
          title: s.title || "",
          subtitle: s.subtitle || "",
          cta: s.buttonText || "Shop Now",
          href: s.buttonLink || "/products",
          image: s.image || null,
        }))
      : [
          {
            tag: "Welcome",
            title: `Everything you love, delivered fast`,
            subtitle: "Free home delivery on your first order",
            cta: "Start Shopping",
            href: "/products",
            image: null,
          },
          ...products.slice(0, 5).map((p) => ({
            tag: p.category,
            title: p.name,
            subtitle:
              p.discountPrice > 0
                ? `Now ${formatCurrency(p.discountPrice)} — was ${formatCurrency(p.price)}`
                : formatCurrency(p.price),
            cta: "Shop Now",
            href: `/products/${p._id}`,
            image: p.images?.[0] || null,
          })),
        ];

  if (slides.length === 0) return null;

  // group into pairs for the duo-tile layout
  const pairs = [];
  for (let i = 0; i < slides.length; i += 2) pairs.push(slides.slice(i, i + 2));

  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || pairs.length <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pairs.length), 6000);
    return () => clearInterval(id);
  }, [paused, pairs.length]);

  const [big, small] = pairs[page] || [];

  const Tile = ({ slide, tone, className = "" }) => {
    if (!slide) return null;
    return (
      <Link
        href={slide.href}
        className={`relative rounded-[20px] overflow-hidden min-h-[400px] flex items-center text-white p-8 sm:p-11 group ${className}`}
      >
        {slide.image ? (
          <img
            src={slide.image}
            alt={slide.title}
            className="absolute inset-0 w-full h-full object-cover z-0 group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className={`absolute inset-0 z-0 ${
              tone === "dark" ? "bg-gradient-to-br from-indigo-950 to-indigo-700" : "bg-gradient-to-br from-maroon to-brick"
            }`}
          />
        )}
        <div
          className={`absolute inset-0 z-0 ${
            tone === "dark"
              ? "bg-gradient-to-r from-indigo-950/90 via-indigo-950/40 to-transparent"
              : "bg-gradient-to-r from-maroon/85 via-maroon/40 to-transparent"
          }`}
        />
        <div className="relative z-10 max-w-xs">
          <span className="text-[12px] font-extrabold uppercase tracking-wide text-gold">{slide.tag}</span>
          <h2 className="font-display text-2xl sm:text-[32px] font-semibold mt-2.5 leading-tight">{slide.title}</h2>
          {slide.subtitle && <p className="text-sm text-white/80 mt-2.5">{slide.subtitle}</p>}
          <span className="inline-block mt-5 bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-full text-sm transition-colors">
            {slide.cta}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className={`grid gap-5 ${small ? "grid-cols-1 lg:grid-cols-[1.5fr_1fr]" : "grid-cols-1"}`}>
        <Tile slide={big} tone="dark" />
        {small && <Tile slide={small} tone="gold" />}
      </div>

      {pairs.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {pairs.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === page ? "w-5 bg-indigo-900" : "w-1.5 bg-line hover:bg-indigo-700/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
