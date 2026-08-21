// components/profile/WishlistPanel.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useCartStore from "@/store/cartStore";
import useWishlistStore from "@/store/wishlistStore";
import { formatCurrency, getEffectivePrice, getDiscountPercentage } from "@/lib/utils";

export default function WishlistPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState("");
  const addItem = useCartStore((s) => s.addItem);
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  const load = () => {
    setLoading(true);
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setItems(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (product) => {
    // keep the shared store (heart icons elsewhere) in sync too
    await toggleWishlist(product._id);
    setItems((list) => list.filter((w) => w.product._id !== product._id));
  };

  const handleAdd = (product) => {
    addItem(product);
    setAddedId(product._id);
    setTimeout(() => setAddedId(""), 1200);
  };

  if (loading) {
    return (
      <div className="bg-cream-white border border-line rounded-xl p-6 flex items-center justify-center py-14">
        <div className="w-7 h-7 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-cream-white border border-line rounded-xl p-6">
      <h3 className="text-[17px] font-bold text-ink mb-4">My Wishlist</h3>

      {items.length === 0 ? (
        <div className="text-center py-14 text-ink-muted border border-dashed border-line rounded-xl">
          <span className="text-3xl">🤍</span>
          <p className="mt-3">Your wishlist is empty.</p>
          <Link href="/products" className="text-indigo-900 hover:underline text-sm font-bold mt-2 inline-block">
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ product }) => {
            const price = getEffectivePrice(product);
            const discount = getDiscountPercentage(product);
            const outOfStock = product.stock <= 0;
            return (
              <div key={product._id} className="border border-line rounded-xl overflow-hidden">
                <div className="relative">
                  <Link href={`/products/${product._id}`} className="block aspect-square bg-cream-alt">
                    {product.images?.[0] && <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />}
                  </Link>
                  <button
                    onClick={() => remove(product)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-xs"
                    aria-label="Remove from wishlist"
                  >
                    ❌
                  </button>
                  {discount > 0 && (
                    <span className="absolute top-2 left-2 bg-brick text-white text-[10px] font-extrabold px-2 py-0.5 rounded">
                      -{discount}%
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <Link href={`/products/${product._id}`} className="text-[13.5px] font-semibold text-ink line-clamp-2 hover:text-indigo-900">
                    {product.name}
                  </Link>
                  <div className="flex items-baseline gap-1.5 mt-1.5">
                    <span className="font-display text-[15px] font-bold text-indigo-900">{formatCurrency(price)}</span>
                    {discount > 0 && <span className="text-[11px] text-ink-muted line-through">{formatCurrency(product.price)}</span>}
                  </div>
                  <button
                    onClick={() => handleAdd(product)}
                    disabled={outOfStock}
                    className={`mt-2.5 w-full py-2 rounded-lg text-[12px] font-bold transition-colors ${
                      outOfStock
                        ? "bg-line text-ink-muted cursor-not-allowed"
                        : addedId === product._id
                        ? "bg-green-600 text-white"
                        : "bg-indigo-950 hover:bg-gold hover:text-indigo-950 text-white"
                    }`}
                  >
                    {outOfStock ? "Out of stock" : addedId === product._id ? "Added ✓" : "Add to Cart"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
