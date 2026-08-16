// app/track/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import TrackingTimeline from "@/components/order/TrackingTimeline";

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, phone }),
      }).then((r) => r.json());
      if (res.success) setResult(res.data);
      else setError(res.message || "No matching order found");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary px-4 py-12">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-sm text-zinc-400 hover:text-accent">← Back to store</Link>
        <h1 className="text-2xl font-extrabold text-white mt-3 mb-1">Track Your Order</h1>
        <p className="text-sm text-zinc-400 mb-6">Enter your order number and the phone number used at checkout.</p>

        <form onSubmit={submit} className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Order Number</label>
            <input
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors"
              placeholder="e.g. SM-000123"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Phone Number</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors"
              placeholder="01700000000"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 text-primary font-bold py-2.5 rounded-md transition-colors disabled:opacity-60"
          >
            {loading ? "Searching..." : "Track Order"}
          </button>
          {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
        </form>

        {result && (
          <div className="bg-primary-light border border-white/10 rounded-xl p-5 mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Order #{result.orderNumber}</p>
              <span className="text-xs text-zinc-400">{formatDate(result.createdAt)}</span>
            </div>
            <TrackingTimeline orderStatus={result.orderStatus} shipment={result.shipment} />
          </div>
        )}
      </div>
    </div>
  );
}
