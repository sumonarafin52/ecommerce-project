// app/checkout/page.js
"use client";

import { useMemo, useState } from "react";
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
  const [method, setMethod] = useState("sslcommerz");
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [checking, setChecking] = useState(false);

  const baseTotal = items.reduce((sum, i) => sum + getEffectivePrice(i) * i.quantity, 0);

  const previewDiscount = useMemo(() => {
    if (!applied) return 0;
    if (applied.minAmount && baseTotal < applied.minAmount) return 0;
    let eligible = 0;
    if (applied.scope === "all" || applied.scope === "customer") {
      eligible = baseTotal;
    } else {
      items.forEach((i) => {
        if (applied.scope === "product" && String(i._id) === String(applied.target))
          eligible += getEffectivePrice(i) * i.quantity;
        if (applied.scope === "category" && i.category === applied.target)
          eligible += getEffectivePrice(i) * i.quantity;
      });
    }
    return applied.type === "percentage" ? Math.round((eligible * applied.value) / 100) : Math.min(applied.value, eligible);
  }, [applied, items, baseTotal]);

  const finalTotal = Math.max(0, baseTotal - previewDiscount);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const applyCoupon = async () => {
    if (!codeInput.trim()) return;
    setChecking(true);
    setCouponMsg("");
    try {
      const res = await fetch(`/api/discounts?code=${encodeURIComponent(codeInput.trim())}`).then((r) => r.json());
      if (res.success) {
        setApplied(res.data);
        setCouponMsg("");
      } else {
        setApplied(null);
        setCouponMsg(res.message);
      }
    } catch {
      setCouponMsg("Failed to validate coupon");
    }
    setChecking(false);
  };

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
          paymentMethod: method,
          discountCode: applied?.code || "",
        }),
      }).then((r) => r.json());

      if (!orderRes.success) throw new Error(orderRes.message);
      const orderId = orderRes.data._id;

      if (method === "cod") {
        clearCart();
        setPlaced(true);
        setPlacing(false);
        return;
      }

      const payRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
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
        <Link href="/login" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-primary-light border border-white/10 rounded-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Order Placed Successfully!</h1>
          <p className="text-sm text-zinc-400">
            Dhonnobad! Apnar order confirm hoyeche. Product receive korar somoy payment korun (Cash on Delivery).
          </p>
          <div className="flex gap-3 pt-2">
            <Link href="/profile" className="flex-1 bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors text-sm">
              View My Orders
            </Link>
            <Link href="/products" className="flex-1 border border-white/15 text-zinc-300 hover:border-accent hover:text-accent font-bold py-3 rounded-md transition-colors text-sm">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Your cart is empty</p>
        <Link href="/products" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
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

            <div className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-1 h-5 bg-accent rounded-full" />
                Payment Method
              </h2>

              <button
                type="button"
                onClick={() => setMethod("sslcommerz")}
                className={`w-full flex items-center gap-3 rounded-md px-4 py-3 border transition-colors text-left ${
                  method === "sslcommerz" ? "border-accent bg-accent/10" : "border-white/10 hover:border-white/30"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-4 ${method === "sslcommerz" ? "border-accent" : "border-zinc-500"}`} />
                <div>
                  <p className="text-sm font-bold text-white">SSLCommerz (recommended)</p>
                  <p className="text-xs text-zinc-400">Pay now with bKash, Nagad, VISA, Mastercard or banking</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMethod("cod")}
                className={`w-full flex items-center gap-3 rounded-md px-4 py-3 border transition-colors text-left ${
                  method === "cod" ? "border-accent bg-accent/10" : "border-white/10 hover:border-white/30"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-4 ${method === "cod" ? "border-accent" : "border-zinc-500"}`} />
                <div>
                  <p className="text-sm font-bold text-white">Cash on Delivery</p>
                  <p className="text-xs text-zinc-400">Product receive korar por payment korun</p>
                </div>
              </button>
            </div>

            {error && (
              <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{error}</p>
            )}
          </form>

          <div className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-white">Order Summary</h2>

            {/* coupon box */}
            <div className="space-y-2">
              {applied ? (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
                  <p className="text-xs font-bold text-green-400">
                    🏷️ {applied.code} applied
                    {previewDiscount === 0 && applied.minAmount > 0 && (
                      <span className="block text-[10px] text-zinc-400">Minimum {applied.minAmount}৳ order required</span>
                    )}
                  </p>
                  <button type="button" onClick={() => setApplied(null)} className="text-zinc-400 hover:text-red-400 text-sm" aria-label="Remove coupon">
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-primary border border-white/15 rounded-md px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-accent uppercase"
                    placeholder="Coupon code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={checking}
                    className="border border-accent text-accent hover:bg-accent hover:text-primary text-xs font-bold px-3 rounded-md transition-colors disabled:opacity-50"
                  >
                    {checking ? "..." : "Apply"}
                  </button>
                </div>
              )}
              {couponMsg && <p className="text-[11px] text-red-400">{couponMsg}</p>}
            </div>

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
              <span>Subtotal</span>
              <span>{formatCurrency(baseTotal)}</span>
            </div>
            {previewDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-400 font-bold">
                <span>Discount ({applied.code})</span>
                <span>− {formatCurrency(previewDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-zinc-300">
              <span>Delivery</span>
              <span className="text-green-400 font-bold">Free</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between text-white font-bold">
              <span>Total</span>
              <span className="text-accent text-lg">{formatCurrency(finalTotal)}</span>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing}
              className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50"
            >
              {placing ? "Placing order..." : method === "cod" ? "Place Order (COD)" : "Place Order & Pay"}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">
              {method === "cod" ? "Product receive korar somoy cash payment korben." : "You will be redirected to SSLCommerz secure payment page."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}