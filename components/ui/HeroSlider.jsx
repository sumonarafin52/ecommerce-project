// components/ui/HeroSlider.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import SmartImage from "@/components/ui/SmartImage";
import { productPath } from "@/lib/slug";

// customSlides: admin-configured slides from Settings → Homepage → Hero Slider
// (shape: { tag, title, subtitle, buttonText, buttonLink, image, active }).
// When provided and non-empty, these take over completely; otherwise the
// original auto-generated behavior (top-rated products) is used so nothing
// breaks for stores that haven't configured anything yet.
//
// Rendered as a "duo tile" layout (one large + one smaller promo side by
// side) matching the storefront redesign — cycles through slides two at a
// time when more than 2 are available.
// A fanned stack of real product photos for the welcome tile. Hidden below
// md, where the tile is too narrow to hold it beside the headline.
/**
 * A look at what is actually in the shop, on the half of the hero the text
 * does not use.
 *
 * These were four real products thrown at the panel at random angles with
 * white Polaroid borders and a heavy drop shadow — decoration that happened
 * to be made of inventory. Worse, the pile was `pointer-events-none` and
 * `aria-hidden`, so the one genuinely useful thing on that side of the hero
 * could be neither clicked nor read aloud.
 *
 * Squared up into a quiet grid it does a job: it shows a first-time visitor
 * the kind of goods this shop sells, which is the question a shop front
 * answers. It stays decorative to assistive technology on purpose — the
 * whole tile is one link whose own text already says where it goes, so
 * reading four product names into that link's name would only make it
 * harder to use.
 */
function CataloguePeek({ items }) {
  // Four fills a square; two or three sit in one row rather than leaving a
  // hole in a 2x2. A new shop with one product shows nothing here — an
  // almost-empty grid advertises an empty shop.
  const shown = items.slice(0, 4);
  if (shown.length < 2) return null;
  // Written out, not built with a template literal: Tailwind generates
  // classes by scanning the source for whole class names, so
  // `grid-cols-${n}` produces a class that never exists in the stylesheet.
  const columns = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2" }[shown.length];
  const width = shown.length === 4 ? "w-[42%] max-w-[330px]" : "w-[46%] max-w-[380px]";

  return (
    <div
      // A white ring is invisible against a product shot on a white
      // background, and most catalogue photography is on white — three
      // tiles in a row merged into one pale block. The gap does the
      // separating instead, letting the panel colour through between them.
      className={`hidden md:grid absolute right-[6%] top-1/2 -translate-y-1/2 ${width} ${columns} gap-3 z-[5] pointer-events-none`}
      aria-hidden="true"
    >
      {shown.map((it, i) => (
        <div
          key={it.src + i}
          // `relative` is load-bearing: SmartImage fills its nearest positioned
          // ancestor, so without it all three images positioned themselves
          // against the grid container and stacked on top of each other —
          // three tiles in the DOM, one photo on screen.
          className="relative aspect-square rounded-r-md overflow-hidden bg-cream-white shadow-e2"
        >
          <SmartImage src={it.src} alt="" sizes="170px" className="object-cover" />
        </div>
      ))}
    </div>
  );
}

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
            // No tag: "Welcome" above the headline was a label with nothing
            // in it. The headline itself was "Everything you love,
            // delivered fast" — true of every shop on the internet, so it
            // told a first-time visitor nothing. What is actually specific
            // about this shop is its reach, so that is what it says now.
            // (An earlier version promised "free delivery on your first
            // order", which nothing in checkout ever honoured.)
            tag: "",
            title: "Order from anywhere in Bangladesh",
            subtitle: "Delivery to all 64 districts",
            cta: "Start shopping",
            href: "/products",
            image: null,
            // real product photos fill the otherwise-empty right half
            collage: products
              .filter((p) => p.images?.[0])
              .slice(0, 4)
              .map((p) => ({ src: p.images[0], name: p.name, href: productPath(p) })),
          },
          ...products.slice(0, 5).map((p) => ({
            tag: p.category,
            title: p.name,
            subtitle:
              p.discountPrice > 0
                ? `Now ${formatCurrency(p.discountPrice)} — was ${formatCurrency(p.price)}`
                : formatCurrency(p.price),
            cta: "Shop Now",
            href: productPath(p),
            image: p.images?.[0] || null,
          })),
        ];

  // NOTE: every hook below must stay above the `slides.length === 0` early
  // return further down — calling hooks conditionally (or after a return)
  // violates React's Rules of Hooks and can crash with "Rendered fewer
  // hooks than expected" if this component ever re-renders with a
  // different slide count.
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  // phones show one slide at a time, cycling through all of them, so none
  // are skipped (the desktop layout shows slides in pairs)
  const [single, setSingle] = useState(0);

  // group into pairs for the duo-tile layout
  const pairs = [];
  for (let i = 0; i < slides.length; i += 2) pairs.push(slides.slice(i, i + 2));

  useEffect(() => {
    if (paused || pairs.length <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pairs.length), 6000);
    return () => clearInterval(id);
  }, [paused, pairs.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(() => setSingle((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;

  const [big, small] = pairs[page] || [];

  const Tile = ({ slide, tone, className = "" }) => {
    if (!slide) return null;
    return (
      <Link
        href={slide.href}
        className={`relative rounded-[20px] overflow-hidden min-h-[260px] sm:min-h-[340px] lg:min-h-[400px] 2xl:min-h-[470px] flex items-center text-white p-8 sm:p-11 group ${className}`}
      >
        {slide.image ? (
          <SmartImage
            src={slide.image}
            alt={slide.title}
            // homepage LCP element — load eagerly rather than lazily
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            quality={82}
            className="object-cover z-0 group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className={`absolute inset-0 z-0 ${
              tone === "dark" ? "bg-gradient-to-br from-indigo-950 to-indigo-700" : "bg-gradient-to-br from-maroon to-brick"
            }`}
          />
        )}
        {/* The scrim has to carry the text, because the photo behind it is
            whatever the shop uploaded — the gold tag and white heading were
            landing on bright flowers at roughly 2:1 contrast. Holding the
            gradient near-opaque across the whole text column, instead of
            fading to 40% by the middle, keeps the words readable on any
            image without flattening the picture on the open side. */}
        <div
          className={`absolute inset-0 z-0 ${
            tone === "dark"
              ? "bg-gradient-to-r from-indigo-950/95 via-indigo-950/80 via-55% to-indigo-950/10"
              : "bg-gradient-to-r from-maroon/95 via-maroon/80 via-55% to-maroon/10"
          }`}
        />
        {slide.collage?.length > 0 && <CataloguePeek items={slide.collage} />}
        <div className="relative z-10 max-w-xs">
          {slide.tag && <span className="text-[12.5px] font-semibold text-gold">{slide.tag}</span>}
          <h2 className="font-display text-2xl sm:text-[32px] font-semibold mt-2.5 leading-tight">{slide.title}</h2>
          {slide.subtitle && <p className="text-sm text-white/90 mt-2.5">{slide.subtitle}</p>}
          <span className="inline-block mt-5 bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-full text-sm transition-colors">
            {slide.cta}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* phones & tablets: one compact slide at a time — two stacked
          full-height banners filled the entire first screen */}
      <div className="lg:hidden">
        <Tile slide={slides[single % slides.length]} tone={single % 2 ? "gold" : "dark"} />
        {slides.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSingle(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === single % slides.length ? "w-5 bg-indigo-900" : "w-1.5 bg-line"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className={`hidden lg:grid gap-5 ${small ? "lg:grid-cols-[1.5fr_1fr]" : "grid-cols-1"}`}>
        <Tile slide={big} tone="dark" />
        {small && <Tile slide={small} tone="gold" />}
      </div>

      {pairs.length > 1 && (
        <div className="hidden lg:flex justify-center gap-1.5 mt-4">
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
