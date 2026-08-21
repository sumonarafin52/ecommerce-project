// app/checkout/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useCartStore, { cartKeyOf } from "@/store/cartStore";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";
import CountryStateSelect from "@/components/checkout/CountryStateSelect";

const inputCls =
  "w-full bg-cream-white border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder-ink-muted outline-none focus:border-indigo-900 transition-colors";
const labelCls = "block text-[12px] font-bold text-ink-soft mb-1.5";

const PAYMENT_METHOD_COPY = {
  cod: { title: "Cash on Delivery", desc: "Pay when your order arrives", icon: "💵" },
  sslcommerz: { title: "Card / Mobile Banking", desc: "bKash, Nagad, VISA, Mastercard or banking — via SSLCommerz", icon: "💳" },
};

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    address: "",
    city: "",
    countryCode: "BD",
    country: "Bangladesh",
    state: "",
    postalCode: "",
  });
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [checking, setChecking] = useState(false);

  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingZone, setShippingZone] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingMethodId, setShippingMethodId] = useState("");

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [saveNewAddress, setSaveNewAddress] = useState(false);

  const baseTotal = items.reduce((sum, i) => sum + getEffectivePrice(i) * i.quantity, 0);

  // load which payment methods are actually enabled (Settings → Payment Methods)
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const methods = res.data.enabledPaymentMethods || [];
          setPaymentMethods(methods);
          if (methods.length) {
            fetch("/api/account/payment-preference")
              .then((r) => r.json())
              .then((prefRes) => {
                const preferred = prefRes.success ? prefRes.data.defaultMethod : null;
                const match = preferred && methods.find((m) => m.id === preferred);
                setMethod(match ? match.id : methods[0].id);
              })
              .catch(() => setMethod(methods[0].id));
          }
        }
      })
      .catch(() => {});
  }, []);

  // load saved addresses and auto-fill from the default one, if any — the
  // whole point of the address book is to skip re-typing this every time
  useEffect(() => {
    fetch("/api/addresses")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return;
        setSavedAddresses(res.data);
        const def = res.data.find((a) => a.isDefault) || res.data[0];
        if (def) applySavedAddress(def);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySavedAddress = (addr) => {
    setSelectedAddressId(addr._id);
    setSaveNewAddress(false);
    setForm({
      fullName: addr.fullName,
      phone: addr.phone,
      address: addr.address,
      city: addr.city,
      countryCode: "", // resolved by CountryStateSelect from the country name
      country: addr.country || "",
      state: addr.state || "",
      postalCode: addr.postalCode || "",
    });
  };

  const useNewAddress = () => {
    setSelectedAddressId("");
    setForm({ fullName: "", phone: "", address: "", city: "", countryCode: "BD", country: "Bangladesh", state: "", postalCode: "" });
  };

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

  const afterDiscount = Math.max(0, baseTotal - previewDiscount);
  const selectedShipping = shippingOptions.find((m) => m._id === shippingMethodId);
  const shippingCost = selectedShipping?.cost || 0;
  const finalTotal = afterDiscount + shippingCost;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleLocationChange = ({ country, countryName, state }) => {
    // reset city/shipping options when the country itself changes — a
    // previously-typed city almost certainly doesn't apply anymore, and the
    // shipping-quote effect below will re-check once a new city is entered
    setForm((f) => ({ ...f, countryCode: country, country: countryName, state, city: f.countryCode !== country ? "" : f.city }));
  };

  // fetch real shipping options for the entered city whenever it changes
  // (debounced) — this is what actually connects Settings → Shipping to checkout
  useEffect(() => {
    if (!form.city.trim() || items.length === 0) {
      setShippingOptions([]);
      setShippingZone(null);
      return;
    }
    const t = setTimeout(() => {
      setShippingLoading(true);
      fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: form.city,
          items: items.map((i) => ({ product: i._id, quantity: i.quantity })),
          subtotal: afterDiscount,
          paymentMethod: method,
        }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            setShippingZone(res.data.zone);
            setShippingOptions(res.data.methods);
            // keep selection if still valid, else default to the cheapest option
            setShippingMethodId((prev) => {
              if (res.data.methods.some((m) => m._id === prev)) return prev;
              const cheapest = [...res.data.methods].sort((a, b) => a.cost - b.cost)[0];
              return cheapest?._id || "";
            });
          }
        })
        .finally(() => setShippingLoading(false));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.city, afterDiscount, method, items.length]);

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
    if (!form.country || !form.state) {
      setError("Please select your country and state/district.");
      return;
    }
    if (!method) {
      setError("No payment method is available. Please contact support.");
      return;
    }
    if (shippingOptions.length > 0 && !shippingMethodId) {
      setError("Please select a shipping method.");
      return;
    }
    setPlacing(true);
    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ product: i._id, quantity: i.quantity, combinationKey: i.combinationKey || undefined })),
          shippingAddress: {
            fullName: form.fullName,
            phone: form.phone,
            address: form.address,
            city: form.city,
            country: form.country,
            state: form.state,
            postalCode: form.postalCode,
          },
          paymentMethod: method,
          discountCode: applied?.code || "",
          shippingMethodId: shippingMethodId || undefined,
        }),
      }).then((r) => r.json());

      if (!orderRes.success) throw new Error(orderRes.message);
      const orderId = orderRes.data._id;

      // fire-and-forget: saving the address for next time should never
      // block or fail the actual checkout
      if (saveNewAddress && !selectedAddressId) {
        fetch("/api/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: form.fullName,
            phone: form.phone,
            address: form.address,
            city: form.city,
            country: form.country,
            state: form.state,
            postalCode: form.postalCode,
          }),
        }).catch(() => {});
      }

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
      <div className="bg-cream-bg min-h-screen flex items-center justify-center font-body2">
        <div className="w-10 h-10 border-4 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-cream-bg min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4 font-body2">
        <p className="text-xl font-bold text-ink">Login required</p>
        <p className="text-sm text-ink-muted">Please sign in to place your order.</p>
        <Link href="/login" className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="bg-cream-bg min-h-screen flex items-center justify-center px-4 font-body2">
        <div className="max-w-md w-full bg-cream-white border border-line rounded-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 border border-green-300 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-700" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Order Placed Successfully!</h1>
          <p className="text-sm text-ink-muted">
            Dhonnobad! Apnar order confirm hoyeche. Product receive korar somoy payment korun (Cash on Delivery).
          </p>
          <div className="flex gap-3 pt-2">
            <Link href="/profile" className="flex-1 bg-indigo-900 hover:bg-indigo-950 text-white font-bold py-3 rounded-lg transition-colors text-sm">
              View My Orders
            </Link>
            <Link href="/products" className="flex-1 border-[1.5px] border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 font-bold py-3 rounded-lg transition-colors text-sm">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-cream-bg min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4 font-body2">
        <p className="text-xl font-bold text-ink">Your cart is empty</p>
        <Link href="/products" className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg transition-colors">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* step indicator */}
        <div className="flex items-center gap-2 mb-6 text-[13px]">
          <Link href="/cart" className="flex items-center gap-1.5 text-ink-muted hover:text-indigo-900 font-bold">
            <span className="w-5 h-5 rounded-full bg-cream-alt border border-line flex items-center justify-center text-[10px]">1</span>
            Cart
          </Link>
          <span className="text-line">─────</span>
          <span className="flex items-center gap-1.5 text-indigo-900 font-bold">
            <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center text-[10px]">2</span>
            Checkout
          </span>
          <span className="text-line">─────</span>
          <span className="flex items-center gap-1.5 text-ink-muted font-bold">
            <span className="w-5 h-5 rounded-full bg-cream-alt border border-line flex items-center justify-center text-[10px]">3</span>
            Confirmation
          </span>
        </div>

        <h1 className="font-display text-2xl font-semibold text-ink mb-5">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <form onSubmit={placeOrder} className="lg:col-span-2 space-y-4">
            <div className="bg-cream-white border border-line rounded-xl p-5 space-y-4">
              <h2 className="text-[15px] font-bold text-ink flex items-center gap-2">
                <span className="w-1 h-5 bg-indigo-900 rounded-full" />
                Shipping Address
              </h2>

              {savedAddresses.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {savedAddresses.map((addr) => (
                    <button
                      key={addr._id}
                      type="button"
                      onClick={() => applySavedAddress(addr)}
                      className={`text-left rounded-lg border-[1.5px] px-3.5 py-2.5 transition-colors ${
                        selectedAddressId === addr._id ? "border-indigo-900 bg-indigo-100/50" : "border-line hover:border-indigo-700/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{addr.label}</span>
                        {addr.isDefault && <span className="text-[10px] font-bold text-gold-dark">Default</span>}
                      </div>
                      <p className="text-xs font-bold text-ink mt-0.5">{addr.fullName}</p>
                      <p className="text-[11px] text-ink-muted line-clamp-1">{addr.address}, {addr.city}</p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={useNewAddress}
                    className={`text-left rounded-lg border-[1.5px] border-dashed px-3.5 py-2.5 flex items-center gap-2 transition-colors ${
                      !selectedAddressId ? "border-indigo-900 bg-indigo-100/50" : "border-line hover:border-indigo-700/40"
                    }`}
                  >
                    <span className="text-lg text-ink-muted">+</span>
                    <span className="text-xs font-bold text-ink-soft">Use a new address</span>
                  </button>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Full name</label>
                  <input className={inputCls} placeholder="Full name" value={form.fullName} onChange={set("fullName")} />
                </div>
                <div>
                  <label className={labelCls}>Phone number</label>
                  <input className={inputCls} placeholder="01XXXXXXXXX" value={form.phone} onChange={set("phone")} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Address</label>
                <input className={inputCls} placeholder="House, road, area" value={form.address} onChange={set("address")} />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <CountryStateSelect
                  country={form.countryCode || form.country}
                  state={form.state}
                  onChange={handleLocationChange}
                  selectClassName={inputCls}
                  labelClassName={labelCls}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>City</label>
                  <input className={inputCls} placeholder="City / Area" value={form.city} onChange={set("city")} />
                </div>
                <div>
                  <label className={labelCls}>Postal code <span className="text-ink-muted font-normal">(optional)</span></label>
                  <input className={inputCls} placeholder="Postal / ZIP code" value={form.postalCode} onChange={set("postalCode")} />
                </div>
              </div>

              {!selectedAddressId && (
                <label className="flex items-center gap-2 text-[13px] text-ink-soft font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveNewAddress}
                    onChange={(e) => setSaveNewAddress(e.target.checked)}
                    className="w-4 h-4 accent-indigo-900"
                  />
                  Save this address for next time
                </label>
              )}
            </div>

            {form.city.trim() && (
              <div className="bg-cream-white border border-line rounded-xl p-5 space-y-3">
                <h2 className="text-[15px] font-bold text-ink flex items-center gap-2">
                  <span className="w-1 h-5 bg-indigo-900 rounded-full" />
                  Shipping Method
                </h2>
                {shippingLoading ? (
                  <p className="text-xs text-ink-muted">Checking delivery options...</p>
                ) : shippingOptions.length === 0 ? (
                  <p className="text-xs text-ink-muted">No delivery methods are configured for this area yet.</p>
                ) : (
                  <div className="space-y-2">
                    {shippingOptions.map((opt) => (
                      <button
                        key={opt._id}
                        type="button"
                        onClick={() => setShippingMethodId(opt._id)}
                        className={`w-full flex items-center justify-between gap-3 rounded-lg px-4 py-3 border-[1.5px] transition-colors text-left ${
                          shippingMethodId === opt._id ? "border-indigo-900 bg-indigo-100/50" : "border-line hover:border-indigo-700/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded-full border-4 shrink-0 ${shippingMethodId === opt._id ? "border-indigo-900" : "border-line"}`} />
                          <div>
                            <p className="text-sm font-bold text-ink">{opt.name}</p>
                            {opt.estimatedDelivery && <p className="text-xs text-ink-muted">{opt.estimatedDelivery}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-indigo-900 shrink-0">
                          {opt.cost > 0 ? formatCurrency(opt.cost) : "Free"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-cream-white border border-line rounded-xl p-5 space-y-3">
              <h2 className="text-[15px] font-bold text-ink flex items-center gap-2">
                <span className="w-1 h-5 bg-indigo-900 rounded-full" />
                Payment Method
              </h2>

              {paymentMethods.length === 0 ? (
                <p className="text-xs text-ink-muted">No payment methods are currently available. Please contact support.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {paymentMethods.map((pm) => {
                    const copy = PAYMENT_METHOD_COPY[pm.id] || { title: pm.label, desc: "", icon: "💰" };
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setMethod(pm.id)}
                        className={`flex items-start gap-3 rounded-lg px-4 py-3 border-[1.5px] transition-colors text-left ${
                          method === pm.id ? "border-indigo-900 bg-indigo-100/50" : "border-line hover:border-indigo-700/40"
                        }`}
                      >
                        <span className="text-xl leading-none mt-0.5">{copy.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-ink">{copy.title}</p>
                          {copy.desc && <p className="text-xs text-ink-muted mt-0.5">{copy.desc}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm font-medium text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3">{error}</p>
            )}
          </form>

          <div className="bg-cream-white border border-line rounded-xl p-5 space-y-3 lg:sticky lg:top-24">
            <h2 className="text-[15px] font-bold text-ink">Order Summary</h2>

            {/* coupon box */}
            <div className="space-y-2">
              {applied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-300 rounded-lg px-3 py-2">
                  <p className="text-xs font-bold text-green-700">
                    🏷️ {applied.code} applied
                    {previewDiscount === 0 && applied.minAmount > 0 && (
                      <span className="block text-[10px] text-ink-muted font-normal">Minimum {applied.minAmount}৳ order required</span>
                    )}
                  </p>
                  <button type="button" onClick={() => setApplied(null)} className="text-ink-muted hover:text-brick text-sm" aria-label="Remove coupon">
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-cream-alt/50 border-[1.5px] border-line rounded-lg px-3 py-2 text-xs text-ink placeholder-ink-muted outline-none focus:border-indigo-900 uppercase"
                    placeholder="Coupon code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={checking}
                    className="border-[1.5px] border-indigo-900 text-indigo-900 hover:bg-indigo-900 hover:text-white text-xs font-bold px-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {checking ? "..." : "Apply"}
                  </button>
                </div>
              )}
              {couponMsg && <p className="text-[11px] text-brick">{couponMsg}</p>}
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
              {items.map((i) => (
                <div key={cartKeyOf(i)} className="flex items-center gap-2 text-sm text-ink-soft">
                  <div className="w-9 h-9 rounded-md bg-cream-alt overflow-hidden shrink-0">
                    {i.images?.[0] && <img src={i.images[0]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="flex-1 line-clamp-1">
                    {i.name} <span className="text-ink-muted">× {i.quantity}</span>
                  </span>
                  <span className="font-semibold text-ink shrink-0">{formatCurrency(getEffectivePrice(i) * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-line pt-3 space-y-2">
              <div className="flex justify-between text-sm text-ink-soft">
                <span>Subtotal</span>
                <span>{formatCurrency(baseTotal)}</span>
              </div>
              {previewDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-700 font-bold">
                  <span>Discount ({applied.code})</span>
                  <span>− {formatCurrency(previewDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-ink-soft">
                <span>Delivery{selectedShipping ? ` (${selectedShipping.name})` : ""}</span>
                <span className={shippingCost > 0 ? "text-ink font-bold" : "text-green-700 font-bold"}>
                  {form.city.trim() ? (shippingCost > 0 ? formatCurrency(shippingCost) : "Free") : "Enter city"}
                </span>
              </div>
            </div>
            <div className="border-t border-line pt-3 flex justify-between items-center">
              <span className="font-bold text-ink">Total</span>
              <span className="font-display text-xl font-bold text-indigo-900">{formatCurrency(finalTotal)}</span>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing}
              className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {placing ? "Placing order..." : method === "cod" ? "Place Order (COD)" : "Place Order & Pay"}
            </button>
            <p className="text-[11px] text-ink-muted text-center">
              {method === "cod" ? "Product receive korar somoy cash payment korben." : "You will be redirected to SSLCommerz secure payment page."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
