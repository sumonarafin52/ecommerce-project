// components/product/QuickView.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import toast from "react-hot-toast";
import useCartStore from "@/store/cartStore";
import SmartImage from "@/components/ui/SmartImage";
import { formatCurrency, getEffectivePrice, getDiscountPercentage, getTotalStock } from "@/lib/utils";
import { productPath } from "@/lib/slug";

export default function QuickView({ product, onClose }) {
  const addItem = useCartStore((s) => s.addItem);
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  const images = product.images?.length ? product.images : [];
  const price = getEffectivePrice(product);
  const discount = getDiscountPercentage(product);
  const stock = getTotalStock(product);
  const hasVariants = product.options?.length > 0;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      // keep Tab focus inside the dialog
      if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll('a[href], button:not([disabled])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const add = () => {
    for (let i = 0; i < qty; i++) addItem(product);
    toast.success(`Added ${qty} × ${product.name} to cart`);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-ink/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view: ${product.name}`}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-cream-white rounded-2xl shadow-premium grid md:grid-cols-2 animate-fade-up"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center text-ink-soft hover:text-ink"
          aria-label="Close quick view"
        >
          ✕
        </button>

        <div className="p-4 sm:p-5 space-y-3">
          <div className="relative aspect-square rounded-xl overflow-hidden bg-cream-alt">
            {images[img] ? (
              <SmartImage src={images[img]} alt={product.name} sizes="(max-width: 768px) 90vw, 420px" className="object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-muted text-sm">No image</div>
            )}
            {discount > 0 && (
              <span className="absolute top-3 left-3 bg-brick text-white text-xs font-extrabold px-2.5 py-1 rounded">-{discount}%</span>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {images.slice(0, 6).map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImg(i)}
                  className={`relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 ${i === img ? "border-indigo-900" : "border-line"}`}
                  aria-label={`Image ${i + 1}`}
                >
                  <SmartImage src={src} alt="" sizes="56px" quality={60} className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 sm:p-7 md:pl-2 flex flex-col">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-maroon">{product.category}</span>
          <h2 className="font-display text-2xl font-semibold text-ink mt-1.5 leading-snug pr-8">{product.name}</h2>
          {product.numReviews > 0 && (
            <p className="text-sm text-ink-soft mt-2">
              <span className="text-gold">★</span> {(product.ratingAvg || 0).toFixed(1)}{" "}
              <span className="text-ink-muted">({product.numReviews} reviews)</span>
            </p>
          )}

          <div className="flex items-baseline gap-2.5 mt-4">
            <span className="font-display text-3xl font-bold text-indigo-900">{formatCurrency(price)}</span>
            {discount > 0 && <span className="text-ink-muted line-through">{formatCurrency(product.price)}</span>}
          </div>

          <p className={`text-sm font-bold mt-2 ${stock <= 0 ? "text-brick" : stock <= 5 ? "text-gold-dark" : "text-green-700"}`}>
            {stock <= 0 ? "Out of stock" : stock <= 5 ? `Only ${stock} left` : "In stock"}
          </p>

          {product.shortDescription && (
            <p className="text-sm text-ink-soft leading-relaxed mt-4 line-clamp-4">{product.shortDescription}</p>
          )}

          <div className="mt-auto pt-6 space-y-3">
            {hasVariants ? (
              <Link
                href={productPath(product)}
                onClick={onClose}
                className="block text-center bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-lg text-sm transition-colors"
              >
                Choose {product.options.map((o) => o.name.toLowerCase()).join(" & ")}
              </Link>
            ) : stock > 0 ? (
              <div className="flex gap-3">
                <div className="flex items-center border-[1.5px] border-line rounded-lg">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-11 font-bold text-ink-soft" aria-label="Decrease quantity">−</button>
                  <span className="w-8 text-center font-bold text-sm text-ink" aria-live="polite">{qty}</span>
                  <button onClick={() => setQty((q) => Math.min(stock, q + 1))} className="w-10 h-11 font-bold text-ink-soft" aria-label="Increase quantity">+</button>
                </div>
                <button onClick={add} className="flex-1 bg-gold hover:bg-gold-dark text-indigo-950 font-bold rounded-lg text-sm transition-colors">
                  Add to Cart
                </button>
              </div>
            ) : (
              <Link
                href={productPath(product)}
                onClick={onClose}
                className="block text-center bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-3.5 rounded-lg text-sm"
              >
                🔔 Get notified when it&apos;s back
              </Link>
            )}
            <Link href={productPath(product)} onClick={onClose} className="block text-center text-sm font-bold text-indigo-900 hover:underline">
              View full details →
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
