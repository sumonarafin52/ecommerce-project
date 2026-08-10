// components/cart/CartItem.jsx
"use client";

import Link from "next/link";
import useCartStore from "@/store/cartStore";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";

export default function CartItem({ item }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const price = getEffectivePrice(item);

  return (
    <div className="flex gap-4 bg-primary-light border border-white/10 rounded-lg p-3 sm:p-4">
      <Link
        href={`/products/${item._id}`}
        className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 bg-black/30 rounded-md overflow-hidden"
      >
        {item.images?.[0] ? (
          <img src={item.images[0]} alt={item.name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full" />
        )}
      </Link>

      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/products/${item._id}`}
            className="block text-sm font-medium text-white line-clamp-2 hover:text-accent"
          >
            {item.name}
          </Link>
          <p className="text-xs text-zinc-400 mt-1">{item.category}</p>
          <p className="text-sm text-accent font-bold mt-1">{formatCurrency(price)}</p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center border border-white/15 rounded-md">
            <button
              onClick={() => updateQuantity(item._id, item.quantity - 1)}
              className="px-2.5 py-1 text-white hover:bg-white/5"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="px-3 py-1 text-sm font-bold text-white">{item.quantity}</span>
            <button
              onClick={() => updateQuantity(item._id, item.quantity + 1)}
              disabled={item.quantity >= item.stock}
              className="px-2.5 py-1 text-white hover:bg-white/5 disabled:opacity-40"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <p className="w-24 text-right text-sm font-bold text-white">
            {formatCurrency(price * item.quantity)}
          </p>

          <button
            onClick={() => removeItem(item._id)}
            aria-label={`Remove ${item.name}`}
            className="text-zinc-400 hover:text-red-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}