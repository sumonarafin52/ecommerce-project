// components/cart/CartItem.jsx
"use client";

import Link from "next/link";
import useCartStore, { cartKeyOf } from "@/store/cartStore";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";

export default function CartItem({ item }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const cartKey = cartKeyOf(item);

  const price = getEffectivePrice(item);
  const hasDiscount = item.discountPrice > 0 && item.discountPrice < item.price;

  return (
    <div className="flex gap-4 px-5 py-5 border-b border-line last:border-0">
      <Link href={`/products/${item._id}`} className="w-[88px] h-[88px] shrink-0 rounded-[10px] overflow-hidden bg-cream-alt">
        {item.images?.[0] ? (
          <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-ink-muted uppercase tracking-wide font-bold">{item.category}</span>
        <Link href={`/products/${item._id}`} className="block text-[14.5px] font-semibold text-ink mt-0.5 hover:text-indigo-900 line-clamp-2">
          {item.name}
        </Link>
        {item.stock <= 5 && item.stock > 0 && (
          <p className="text-[12px] text-brick font-semibold mt-1">Only {item.stock} left in stock</p>
        )}

        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center border-[1.5px] border-line rounded-lg w-fit">
            <button
              onClick={() => updateQuantity(cartKey, item.quantity - 1)}
              className="w-8 h-9 flex items-center justify-center text-ink-soft font-bold hover:bg-cream-alt transition-colors"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-9 text-center text-sm font-bold text-ink">{item.quantity}</span>
            <button
              onClick={() => updateQuantity(cartKey, item.quantity + 1)}
              disabled={item.quantity >= item.stock}
              className="w-8 h-9 flex items-center justify-center text-ink-soft font-bold hover:bg-cream-alt transition-colors disabled:opacity-30"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <button onClick={() => removeItem(cartKey)} className="text-[12.5px] font-bold text-brick hover:underline">
            Remove
          </button>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="font-display text-[17px] font-bold text-indigo-900">{formatCurrency(price * item.quantity)}</p>
        {hasDiscount && (
          <p className="text-xs text-ink-muted line-through mt-0.5">{formatCurrency(item.price * item.quantity)}</p>
        )}
      </div>
    </div>
  );
}
