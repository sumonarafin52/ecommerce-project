// app/cart/page.js
"use client";

import Link from "next/link";
import useCartStore from "@/store/cartStore";
import CartItem from "@/components/cart/CartItem";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const total = items.reduce((sum, i) => sum + getEffectivePrice(i) * i.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <svg className="w-16 h-16 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 5h14M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
          />
        </svg>
        <p className="text-xl font-bold text-white">Your cart is empty</p>
        <p className="text-sm text-zinc-400">Looks like you haven't added anything yet.</p>
        <Link
          href="/products"
          className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Shopping Cart ({items.length})</h1>
          <button onClick={clearCart} className="text-sm text-zinc-400 hover:text-red-400 transition-colors">
            Clear cart
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <CartItem key={item._id} item={item} />
            ))}
          </div>

          <div className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-white">Order Summary</h2>
            <div className="flex justify-between text-sm text-zinc-300">
              <span>Subtotal</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-300">
              <span>Delivery</span>
              <span className="text-green-400 font-bold">Free</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between text-white font-bold">
              <span>Total</span>
              <span className="text-accent text-lg">{formatCurrency(total)}</span>
            </div>
            <Link
              href="/checkout"
              className="block text-center bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors"
            >
              Proceed to Checkout
            </Link>
            <Link href="/products" className="block text-center text-sm text-zinc-400 hover:text-accent">
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}