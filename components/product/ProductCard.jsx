// components/product/ProductCard.jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useCartStore from "@/store/cartStore";
import useWishlistStore from "@/store/wishlistStore";
import { formatCurrency, getEffectivePrice, getDiscountPercentage, getTotalStock } from "@/lib/utils";

export default function ProductCard({ product }) {
  const router = useRouter();
  const { data: session } = useSession();
  const addItem = useCartStore((s) => s.addItem);
  const wished = useWishlistStore((s) => s.has(product._id));
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const [added, setAdded] = useState(false);

  const price = getEffectivePrice(product);
  const discount = getDiscountPercentage(product);
  const outOfStock = getTotalStock(product) <= 0;
  const hasVariants = product.options?.length > 0;

  const handleAdd = () => {
    if (hasVariants) {
      // can't add a specific variant from a summary card — send them to
      // pick one on the detail page instead of guessing
      router.push(`/products/${product._id}`);
      return;
    }
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const handleWishlist = (e) => {
    e.preventDefault();
    if (!session) {
      router.push(`/login?callbackUrl=${encodeURIComponent("/products/" + product._id)}`);
      return;
    }
    toggleWishlist(product._id);
  };

  return (
    <div className="group relative bg-cream-white border border-line rounded-xl overflow-hidden transition-all hover:shadow-[0_1px_2px_rgba(15,81,50,.06),0_8px_24px_rgba(15,81,50,.07)] hover:-translate-y-0.5">
      <Link href={`/products/${product._id}`}>
        <div className="relative aspect-square bg-cream-alt overflow-hidden">
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-muted text-sm">
              No image
            </div>
          )}
          {discount > 0 && (
            <span className="absolute top-2.5 left-2.5 bg-brick text-white text-[11px] font-extrabold px-2.5 py-1 rounded">
              -{discount}%
            </span>
          )}
          {outOfStock && (
            <span className="absolute top-2.5 left-2.5 bg-ink-muted text-white text-[11px] font-bold px-2.5 py-1 rounded">
              Out of stock
            </span>
          )}
          <button
            onClick={handleWishlist}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.12)] flex items-center justify-center text-sm"
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          >
            {wished ? "❤️" : "🤍"}
          </button>
        </div>
      </Link>

      <div className="p-3.5">
        <p className="text-[11px] uppercase tracking-wide text-ink-muted font-bold">{product.category}</p>

        <Link
          href={`/products/${product._id}`}
          className="block text-[14.5px] text-ink font-semibold leading-snug mt-1 min-h-[38px] line-clamp-2 hover:text-indigo-900 transition-colors"
        >
          {product.name}
        </Link>

        <div className="flex items-center gap-1 mt-2">
          <span className="text-gold text-xs tracking-tight">
            {"★".repeat(Math.round(product.ratingAvg)) + "☆".repeat(5 - Math.round(product.ratingAvg))}
          </span>
          <span className="text-[11px] text-ink-muted">({product.numReviews})</span>
        </div>

        <div className="flex items-baseline gap-2 mt-2.5">
          <span className="font-display text-lg font-bold text-indigo-900">{formatCurrency(price)}</span>
          {discount > 0 && (
            <span className="text-xs text-ink-muted line-through">{formatCurrency(product.price)}</span>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className={`mt-3 w-full py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
            outOfStock
              ? "bg-line text-ink-muted cursor-not-allowed"
              : added
              ? "bg-green-600 text-white"
              : "bg-indigo-950 text-white group-hover:bg-gold group-hover:text-indigo-950"
          }`}
        >
          {outOfStock ? "Unavailable" : hasVariants ? "Select Options" : added ? "Added ✓" : "🛒 Add to Cart"}
        </button>
      </div>
    </div>
  );
}
