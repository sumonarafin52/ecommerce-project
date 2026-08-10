// components/product/ProductCard.jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import useCartStore from "@/store/cartStore";
import { formatCurrency, getEffectivePrice, getDiscountPercentage } from "@/lib/utils";

export default function ProductCard({ product }) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);

  const price = getEffectivePrice(product);
  const discount = getDiscountPercentage(product);
  const outOfStock = product.stock <= 0;

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="group relative bg-primary-light border border-white/10 rounded-lg overflow-hidden hover:border-accent/60 hover:shadow-glow transition-all">
      <Link href={`/products/${product._id}`}>
        <div className="relative aspect-square bg-black/30 overflow-hidden">
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
              No image
            </div>
          )}
          {discount > 0 && (
            <span className="absolute top-2 left-2 bg-accent text-primary text-[11px] font-bold px-2 py-0.5 rounded-full">
              -{discount}%
            </span>
          )}
          {outOfStock && (
            <span className="absolute top-2 right-2 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              Out of stock
            </span>
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400">{product.category}</p>

        <Link
          href={`/products/${product._id}`}
          className="block text-sm text-zinc-100 font-medium line-clamp-2 hover:text-accent transition-colors min-h-[40px]"
        >
          {product.name}
        </Link>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <svg
              key={n}
              className={`w-3.5 h-3.5 ${n <= Math.round(product.ratingAvg) ? "text-accent" : "text-zinc-600"}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
            </svg>
          ))}
          <span className="text-[11px] text-zinc-400 ml-1">({product.numReviews})</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-white">{formatCurrency(price)}</span>
          {discount > 0 && (
            <span className="text-xs text-zinc-500 line-through">{formatCurrency(product.price)}</span>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className={`w-full py-2 rounded-md text-sm font-bold transition-colors ${
            outOfStock
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : added
              ? "bg-green-600 text-white"
              : "bg-accent hover:bg-accent/80 text-primary"
          }`}
        >
          {outOfStock ? "Unavailable" : added ? "Added ✓" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}