// app/cart/page.js
"use client";

import Link from "next/link";
import useCartStore, { cartKeyOf } from "@/store/cartStore";
import CartItem from "@/components/cart/CartItem";
import RecommendedGrid from "@/components/product/RecommendedGrid";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.getTotalPrice());
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="bg-cream-bg min-h-screen font-body2">
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <span className="text-5xl">🛒</span>
          <h1 className="font-display text-2xl font-semibold text-ink mt-4">Your cart is empty</h1>
          <p className="text-sm text-ink-muted mt-2">Looks like you haven't added anything yet.</p>
          <Link
            href="/products"
            className="inline-block mt-6 bg-indigo-900 hover:bg-indigo-950 text-white font-bold px-6 py-3 rounded-lg transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <nav className="text-[13px] text-ink-muted flex items-center gap-2 mb-4">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span>›</span>
          <span className="text-ink">Shopping Cart</span>
        </nav>

        <h1 className="font-display text-2xl font-semibold text-ink mb-5">
          Shopping Cart <span className="text-ink-muted text-base font-normal">({itemCount} item{itemCount === 1 ? "" : "s"})</span>
        </h1>

        <div className="grid lg:grid-cols-[1fr_340px] gap-7 pb-14">
          {/* items */}
          <div className="bg-cream-white border border-line rounded-xl overflow-hidden h-fit">
            {items.map((item) => (
              <CartItem key={cartKeyOf(item)} item={item} />
            ))}
          </div>

          {/* summary */}
          <aside className="bg-cream-white border border-line rounded-xl p-5 h-fit lg:sticky lg:top-4 space-y-4">
            <h2 className="font-display text-lg font-semibold text-ink">Order Summary</h2>

            <div className="space-y-2 text-[13.5px]">
              <div className="flex justify-between text-ink-soft">
                <span>Subtotal ({itemCount} item{itemCount === 1 ? "" : "s"})</span>
                <span className="font-semibold text-ink">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Shipping</span>
                <span className="text-ink-muted">Calculated at checkout</span>
              </div>
            </div>

            <div className="border-t border-line pt-3 flex justify-between items-center">
              <span className="font-bold text-ink">Total</span>
              <span className="font-display text-xl font-bold text-indigo-900">{formatCurrency(subtotal)}</span>
            </div>

            <Link
              href="/checkout"
              className="block text-center bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3 rounded-lg transition-colors"
            >
              Proceed to Checkout
            </Link>
            <Link href="/products" className="block text-center text-[13px] font-bold text-indigo-900 hover:underline">
              ← Continue Shopping
            </Link>

            <div className="border-t border-line pt-4 flex items-center gap-2 text-[12px] text-ink-muted">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure checkout — your information is protected
            </div>
          </aside>
        </div>

        <div className="pb-14">
          <h2 className="font-display text-xl font-semibold text-ink mb-4">You might also like</h2>
          <RecommendedGrid />
        </div>
      </div>
    </div>
  );
}
