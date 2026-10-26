// components/product/DeliveryEstimate.jsx
"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import Icon from "@/components/ui/Icon";

const AREA_KEY = "sm_delivery_city"; // shared with the header picker and checkout
const QUICK = ["Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi"];

export default function DeliveryEstimate({ productId, unitPrice, quantity = 1 }) {
  const [area, setArea] = useState(null); // null = not read yet
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState(null); // { methods: [...] } | null
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setArea(localStorage.getItem(AREA_KEY) || "");
  }, []);

  useEffect(() => {
    if (!area) return;
    let alive = true;
    setLoading(true);
    fetch("/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: area, items: [{ product: productId, quantity }], subtotal: unitPrice * quantity }),
    })
      .then((r) => r.json())
      .then((res) => alive && setQuote(res.success ? res.data : { methods: [] }))
      .catch(() => alive && setQuote({ methods: [] }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [area, productId, unitPrice, quantity]);

  const save = (value) => {
    const v = String(value).trim().slice(0, 60);
    if (!v) return;
    localStorage.setItem(AREA_KEY, v);
    setArea(v);
    setEditing(false);
  };

  if (area === null) return null;

  const methods = quote?.methods || [];
  const cheapest = methods.length ? [...methods].sort((a, b) => a.cost - b.cost)[0] : null;
  // a free-delivery threshold the customer hasn't reached yet (real setting)
  const threshold = methods
    .map((m) => m.freeShippingThreshold)
    .filter((t) => t > unitPrice * quantity)
    .sort((a, b) => a - b)[0];

  return (
    <div className="rounded-xl border border-line bg-cream-white px-4 py-3.5">
      {!area || editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(draft);
          }}
        >
          <label htmlFor="delivery-area" className="flex items-center gap-2 text-sm font-bold text-ink">
            <Icon name="truck" size={17} className="text-gold-dark" /> Check delivery cost &amp; time
          </label>
          <div className="flex gap-2 mt-2.5">
            <input
              id="delivery-area"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your area, e.g. Savar"
              className="flex-1 min-w-0 border-[1.5px] border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-900"
            />
            <button className="bg-indigo-900 hover:bg-indigo-950 text-white text-sm font-bold px-4 rounded-lg">Check</button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {QUICK.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => save(c)}
                className="text-[12px] font-semibold rounded-full px-2.5 py-1 border border-line text-ink-soft hover:border-indigo-700"
              >
                {c}
              </button>
            ))}
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <Icon name="truck" size={18} className="text-gold-dark shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="text-ink-soft">
              Delivery to <span className="font-bold text-ink">{area}</span>{" "}
              <button onClick={() => { setDraft(area); setEditing(true); }} className="text-indigo-900 font-bold text-[12.5px] hover:underline ml-1">
                Change
              </button>
            </p>
            {loading ? (
              <p className="text-ink-muted mt-1">Checking delivery options…</p>
            ) : cheapest ? (
              <>
                <p className="mt-1">
                  <span className={`font-bold ${cheapest.cost === 0 ? "text-green-700" : "text-ink"}`}>
                    {cheapest.cost === 0 ? "Free delivery" : `${formatCurrency(cheapest.cost)} delivery`}
                  </span>
                  {cheapest.estimatedDelivery && <span className="text-ink-muted"> · {cheapest.estimatedDelivery}</span>}
                  {methods.length > 1 && <span className="text-ink-muted"> · {methods.length} options at checkout</span>}
                </p>
                {threshold && (
                  <p className="text-[12.5px] text-gold-dark font-semibold mt-1">
                    Free delivery on orders over {formatCurrency(threshold)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-ink-muted mt-1">Delivery charge for this area is confirmed at checkout.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
