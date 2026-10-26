// app/cart/page.js
"use client";

import Link from "next/link";
import useCartStore, { cartKeyOf } from "@/store/cartStore";
import { useCartSync } from "@/lib/useCartSync";
import CartChangeNotice from "@/components/cart/CartChangeNotice";
import CartItem from "@/components/cart/CartItem";
import RecommendedGrid from "@/components/product/RecommendedGrid";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/components/LanguageProvider";
import Icon from "@/components/ui/Icon";

export default function CartPage() {
  const t = useT();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.getTotalPrice());
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  // A cart lives in localStorage and can be days old. Check it against the
  // shop before showing a total the shopper might act on.
  const { checking, notices, dismiss } = useCartSync();

  if (items.length === 0) {
    return (
      <div className="bg-cream-bg min-h-screen font-body2">
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <Icon name="cart" size={44} strokeWidth={1.2} className="text-ink-muted mx-auto" />
          <h1 className="font-display text-2xl font-semibold text-ink mt-4">{t("cartEmpty")}</h1>
          <p className="text-sm text-ink-muted mt-2">Looks like you haven&apos;t added anything yet.</p>
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
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6">
        <nav className="text-[13px] text-ink-muted flex items-center gap-2 mb-4">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span>›</span>
          <span className="text-ink">Shopping Cart</span>
        </nav>

        <h1 className="font-display text-2xl font-semibold text-ink mb-5">
          {t("yourCart")} <span className="text-ink-muted text-base font-normal">({itemCount} {itemCount === 1 ? t("item") : t("items")})</span>
        </h1>

        {checking && (
          <p className="text-[12px] text-ink-muted mb-3" role="status">
            Checking prices and availability…
          </p>
        )}
        <CartChangeNotice notices={notices} onDismiss={dismiss} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-7 pb-14">
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
                <span>{t("subtotal")} ({itemCount} {itemCount === 1 ? t("item") : t("items")})</span>
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
              {t("checkout")}
            </Link>
            <Link href="/products" className="block text-center text-[13px] font-bold text-indigo-900 hover:underline">
              ← {t("continueShopping")}
            </Link>

            <div className="border-t border-line pt-4 flex items-center gap-2 text-[12px] text-ink-muted">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure checkout — your information is protected
            </div>
          </aside>
        </div>

        {/* Seeded from the basket itself rather than from browsing history:
            at the cart, what somebody is about to buy says far more about
            what else they need than what they glanced at earlier. The
            component supplies its own heading, which names the real reason
            these were picked. */}
        <div className="pb-14">
          <RecommendedGrid seedIds={items.map((i) => i._id)} />
        </div>
      </div>

      {/* Phones: checkout always one tap away, sitting just above the tab
          bar — otherwise the button is below every cart item. */}
      <div className="md:hidden fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 bg-cream-white/95 backdrop-blur-md border-t border-line px-4 py-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(30,58,95,0.08)]">
        <div className="min-w-0">
          <p className="text-[11px] text-ink-muted leading-none">{itemCount} {itemCount === 1 ? t("item") : t("items")}</p>
          <p className="font-display text-lg font-bold text-indigo-900 leading-tight mt-0.5">{formatCurrency(subtotal)}</p>
        </div>
        <Link
          href="/checkout"
          className="flex-1 text-center bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3 rounded-xl text-sm transition-colors"
        >
          {t("checkout")} →
        </Link>
      </div>
      <div className="md:hidden h-[68px]" aria-hidden="true" />
    </div>
  );
}
