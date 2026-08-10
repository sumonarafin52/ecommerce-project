// app/checkout/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useCartStore from "@/store/cartStore";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";

const inputCls =
  "w-full bg-primary-light border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const [form, setForm] = useState({ fullName: "", phone: "", address: "", city: "" });
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);

  const total = items.reduce((sum, i) => sum + getEffectivePrice(i) * i.quantity, 0);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const placeOrder = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.fullName || !form.phone || !form.address || !form.city) {
      setError("Please fill in all shipping fields.");
      return;
    }
    setPlacing(true);
    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ product: i._id, quantity: i.quantity })),
          shippingAddress: form,
          paymentMethod: "sslcommerz",
        }),
      }).then((r) => r.json());

      if (!orderRes.success) throw new Error(orderRes.message);

      const payRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderRes.data._id }),
      }).then((r) => r.json());

      if (!payRes.success || !payRes.data.url) {
        throw new Error(payRes.message || "Payment initiation failed");
      }

      clearCart();
      window.location.href = payRes.data.url;
    } catch (err) {
      setError(err.message);
      setPlacing(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Login required</p>
        <p className="text-sm text-zinc-400">Please sign in to place your order.</p>
        <Link
          href="/login"
          className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Your cart is empty</p>
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
        <h1 className="text-2xl font-bold text-white mb-6">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <form onSubmit={placeOrder} className="lg:col-span-2 space-y-4">
            <div className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-1 h-5 bg-accent rounded-full" />
                Shipping Address
              </h2>
              <input className={inputCls} placeholder="Full name" value={form.fullName} onChange={set("fullName")} />
              <input className={inputCls} placeholder="Phone number (01XXXXXXXXX)" value={form.phone} onChange={set("phone")} />
              <input className={inputCls} placeholder="Address (house, road, area)" value={form.address} onChange={set("address")} />
              <input className={inputCls} placeholder="City" value={form.city} onChange={set("city")} />
            </div>

            <div className="bg-primary-light border border-white/10 rounded-xl p-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                <span className="w-1 h-5 bg-accent rounded-full" />
                Payment Method
              </h2>
              <div className="flex items-center gap-3 border border-accent/50 bg-accent/10 rounded-md px-4 py-3">
                <span className="w-4 h-4 rounded-full border-4 border-accent" />
                <div>
                  <p className="text-sm font-bold text-white">SSLCommerz (recommended)</p>
                  <p className="text-xs text-zinc-400">Pay with bKash, Nagad, VISA, Mastercard or banking</p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">
                {error}
              </p>
            )}
          </form>

          <div className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-white">Order Summary</h2>
            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
              {items.map((i) => (
                <div key={i._id} className="flex justify-between text-sm text-zinc-300">
                  <span className="line-clamp-1">
                    {i.name} <span className="text-zinc-500">× {i.quantity}</span>
                  </span>
                  <span>{formatCurrency(getEffectivePrice(i) * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm text-zinc-300">
              <span>Delivery</span>
              <span className="text-green-400 font-bold">Free</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between text-white font-bold">
              <span>Total</span>
              <span className="text-accent text-lg">{formatCurrency(total)}</span>
            </div>
            <button
              onClick={placeOrder}
              disabled={placing}
              className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50"
            >
              {placing ? "Redirecting to payment..." : "Place Order & Pay"}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">
              You will be redirected to SSLCommerz secure payment page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}