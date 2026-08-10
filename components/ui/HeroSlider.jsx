// components/ui/HeroSlider.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export default function HeroSlider({ products = [] }) {
  const slides = [
    {
      tag: "Welcome to Sumon Mart",
      title: "Everything you love, delivered fast",
      subtitle: "Free home delivery on your first order",
      cta: "Start Shopping",
      href: "/products",
      image: null,
    },
    ...products.slice(0, 4).map((p) => ({
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

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;

  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setIndex((i) => (i + 1) % slides.length);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 shadow-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div
            key={i}
            className="w-full shrink-0 bg-gradient-to-br from-primary-light via-primary to-black"
          >
            <div className="flex items-center gap-6 px-6 sm:px-12 py-10 sm:py-16 min-h-[280px] sm:min-h-[360px]">
              <div className="flex-1 space-y-4">
                <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary bg-accent px-3 py-1 rounded-full">
                  {s.tag}
                </span>
                <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight">
                  {s.title}
                </h2>
                <p className="text-zinc-300 text-sm sm:text-lg">{s.subtitle}</p>
                <Link
                  href={s.href}
                  className="inline-block bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md shadow-glow transition-colors"
                >
                  {s.cta}
                </Link>
              </div>
              {s.image && (
                <div className="hidden md:block w-72 h-64 shrink-0">
                  <img
                    src={s.image}
                    alt={s.title}
                    className="w-full h-full object-contain drop-shadow-2xl"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <span className="absolute top-4 right-5 text-xs font-bold tracking-widest text-zinc-400">
        {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
      </span>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-accent hover:text-primary text-white rounded-full p-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-accent hover:text-primary text-white rounded-full p-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-8 bg-accent" : "w-3 bg-white/30 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}