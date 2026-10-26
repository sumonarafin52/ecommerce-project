// app/order-confirmation/[id]/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import useCartStore from "@/store/cartStore";
import SmartImage from "@/components/ui/SmartImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function OrderConfirmationPage() {
  const { id } = useParams();
  const clearCart = useCartStore((s) => s.clearCart);
  const [order, setOrder] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | missing

  const [guestToken, setGuestToken] = useState("");

  useEffect(() => {
    // returning from a confirmed online payment: only now is it safe to
    // empty the cart (it's kept through the redirect in case payment fails)
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment === "VALID" || payment === "VALIDATED") clearCart();

    // guests reach this page from their emailed link, which carries ?t=
    const token = new URLSearchParams(window.location.search).get("t");
    // kept so links on this page (the invoice, above all) can carry it too
    setGuestToken(token || "");
    fetch(`/api/orders/${id}${token ? `?t=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setOrder(res.data);
          setState("ok");
        } else setState("missing");
      })
      .catch(() => setState("missing"));
  }, [id, clearCart]);

  if (state === "loading") {
    return (
      <div className="bg-cream-bg min-h-screen font-body2">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div className="bg-cream-bg min-h-[60vh] flex items-center justify-center px-4 font-body2">
        <div className="text-center max-w-sm">
          <h1 className="font-display text-2xl font-semibold text-ink">Order not found</h1>
          <p className="text-sm text-ink-muted mt-2">You may need to sign in with the account that placed it, or open the link from your confirmation email.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Link href="/profile" className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg text-sm">
              My orders
            </Link>
            <Link href="/track" className="border-[1.5px] border-line hover:border-indigo-700 text-ink-soft font-bold px-6 py-3 rounded-lg text-sm">
              Track as guest
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isGuest = !order.user; // no account on the order
  const online = order.paymentMethod !== "cod";
  const awaitingPayment = online && order.paymentStatus !== "paid";
  const a = order.shippingAddress || {};

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      toast.success("Order number copied");
    } catch {}
  };

  const steps = online
    ? ["Payment confirmed", "We prepare your order", "Out for delivery", "Delivered"]
    : ["Order confirmed", "We prepare your order", "Out for delivery", "Pay on delivery"];

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10 space-y-4">
        {/* header */}
        <section className="bg-cream-white border border-line rounded-2xl p-6 sm:p-8 text-center animate-fade-up">
          <div
            className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
              awaitingPayment ? "bg-gold-light text-gold-dark" : "bg-green-100 text-green-700"
            }`}
          >
            {awaitingPayment ? (
              <span className="text-2xl" aria-hidden="true">⏳</span>
            ) : (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink mt-4">
            {awaitingPayment ? "Waiting for your payment" : "Thank you — your order is placed!"}
          </h1>
          <p className="text-sm text-ink-muted mt-2">
            {awaitingPayment
              ? "We haven't received confirmation of your payment yet. If you completed it, this page will update shortly."
              : online
              ? "Your payment was received. We've emailed you a confirmation."
              : "Please have the payment ready when your order arrives. We've emailed you a confirmation."}
          </p>

          <button
            onClick={copyNumber}
            className="mt-5 inline-flex items-center gap-2 bg-cream-alt border border-line rounded-xl px-4 py-2.5 hover:border-indigo-700/40"
            title="Copy order number"
          >
            <span className="text-xs text-ink-muted">Order number</span>
            <span className="font-mono font-bold text-indigo-900 tracking-wide">{order.orderNumber}</span>
            <span className="text-ink-muted text-xs" aria-hidden="true">⧉</span>
          </button>
          <p className="text-[11.5px] text-ink-muted mt-2">Placed {formatDateTime(order.createdAt)}</p>
        </section>

        {/* what happens next */}
        <section className="bg-cream-white border border-line rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-bold text-ink mb-4">What happens next</h2>
          <ol className="grid grid-cols-4 gap-2">
            {steps.map((s, i) => {
              const done = i === 0 && !awaitingPayment;
              return (
                <li key={s} className="text-center">
                  <div
                    className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold ${
                      done ? "bg-indigo-900 text-white" : "bg-cream-alt text-ink-muted border border-line"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <p className={`text-[11.5px] sm:text-xs mt-2 leading-tight ${done ? "font-bold text-ink" : "text-ink-muted"}`}>{s}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* items + totals */}
        <section className="bg-cream-white border border-line rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-bold text-ink mb-3">Your items</h2>
          <ul className="divide-y divide-line">
            {order.items.map((it, i) => (
              <li key={i} className="py-3 flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-cream-alt shrink-0">
                  {it.product?.images?.[0] && <SmartImage src={it.product.images[0]} alt="" sizes="56px" className="object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink line-clamp-2">{it.name}</p>
                  <p className="text-xs text-ink-muted">
                    {it.quantity} × {formatCurrency(it.price)}
                  </p>
                </div>
                <p className="text-sm font-bold text-ink shrink-0">{formatCurrency(it.price * it.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="border-t border-line pt-3 mt-1 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-soft">
              <dt>Subtotal</dt>
              <dd>{formatCurrency(order.baseAmount ?? order.items.reduce((s, i) => s + i.price * i.quantity, 0))}</dd>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-green-700 font-semibold">
                <dt>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</dt>
                <dd>− {formatCurrency(order.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-ink-soft">
              <dt>Delivery{order.shippingMethodName ? ` (${order.shippingMethodName})` : ""}</dt>
              <dd>{order.shippingCost > 0 ? formatCurrency(order.shippingCost) : "Free"}</dd>
            </div>
            <div className="flex justify-between items-center border-t border-line pt-2.5 mt-1">
              <dt className="font-bold text-ink">{online && !awaitingPayment ? "Total paid" : "Total"}</dt>
              <dd className="font-display text-xl font-bold text-indigo-900">{formatCurrency(order.totalAmount)}</dd>
            </div>
          </dl>
        </section>

        {/* address + payment */}
        <section className="grid sm:grid-cols-2 gap-4">
          <div className="bg-cream-white border border-line rounded-2xl p-5">
            <h2 className="text-sm font-bold text-ink mb-2">Delivering to</h2>
            <p className="text-sm text-ink">{a.fullName}</p>
            <p className="text-sm text-ink-soft">{a.phone}</p>
            <p className="text-sm text-ink-soft mt-1">
              {[a.address, a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="bg-cream-white border border-line rounded-2xl p-5">
            <h2 className="text-sm font-bold text-ink mb-2">Payment</h2>
            <p className="text-sm text-ink">{online ? "Online payment" : "Cash on delivery"}</p>
            <p className={`text-sm font-semibold mt-1 ${order.paymentStatus === "paid" ? "text-green-700" : "text-gold-dark"}`}>
              {order.paymentStatus === "paid" ? "Paid" : online ? "Awaiting confirmation" : `Pay ${formatCurrency(order.totalAmount)} on delivery`}
            </p>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href={isGuest ? `/track?order=${encodeURIComponent(order.orderNumber)}` : "/profile"}
            className="flex-1 text-center bg-indigo-900 hover:bg-indigo-950 text-white font-bold py-3.5 rounded-xl text-sm"
          >
            Track this order
          </Link>
          {/* A guest has no profile, so this confirmation page was their only
              touchpoint and there was no route to their invoice at all. The
              token travels with the link so the invoice opens for them. */}
          <Link
            href={`/invoice/${order._id}${guestToken ? `?t=${encodeURIComponent(guestToken)}` : ""}`}
            className="flex-1 text-center border-[1.5px] border-line hover:border-indigo-700 text-ink-soft font-bold py-3.5 rounded-xl text-sm"
          >
            View invoice
          </Link>
          <Link href="/products" className="flex-1 text-center border-[1.5px] border-line hover:border-indigo-700 text-ink-soft font-bold py-3.5 rounded-xl text-sm">
            Continue shopping
          </Link>
        </div>
        {isGuest && (
          <div className="bg-gold-light/40 border border-gold/40 rounded-xl px-4 py-3 text-[13px] text-ink-soft">
            <p className="font-bold text-ink">You ordered as a guest</p>
            <p className="mt-1">
              We&apos;ve emailed this confirmation to you. To check on it later, use{" "}
              <Link href={`/track?order=${encodeURIComponent(order.orderNumber)}`} className="font-bold text-indigo-900 hover:underline">
                Track order
              </Link>{" "}
              with your order number and phone number — or{" "}
              <Link href="/register" className="font-bold text-indigo-900 hover:underline">
                create an account
              </Link>{" "}
              to keep all your orders in one place.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-ink-muted">
          Questions? <Link href="/contact" className="font-bold text-indigo-900 hover:underline">Contact us</Link> and mention order{" "}
          {order.orderNumber}.
        </p>
      </div>
    </div>
  );
}
