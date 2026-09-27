// components/product/StockAlertButton.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

export default function StockAlertButton({ productId, combinationKey = "", className = "" }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setSubscribed(false);
      return;
    }
    const qs = new URLSearchParams({ product: productId, combinationKey });
    fetch(`/api/stock-alerts?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => res.success && setSubscribed(res.data.subscribed))
      .catch(() => {});
  }, [productId, combinationKey, status]);

  const toggle = async () => {
    if (!session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/products/${productId}`)}`);
      return;
    }
    setBusy(true);
    try {
      if (subscribed) {
        const qs = new URLSearchParams({ product: productId, combinationKey });
        await fetch(`/api/stock-alerts?${qs}`, { method: "DELETE" });
        setSubscribed(false);
        toast.success("You won't be notified for this item");
      } else {
        const res = await fetch("/api/stock-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product: productId, combinationKey }),
        }).then((r) => r.json());
        if (!res.success) throw new Error(res.message);
        setSubscribed(true);
        toast.success(res.message);
      }
    } catch (err) {
      toast.error(err.message || "Couldn't update your alert");
    }
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`py-3.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-60 ${
        subscribed
          ? "bg-indigo-100 text-indigo-900 border-[1.5px] border-indigo-700/30 hover:bg-indigo-100/70"
          : "bg-indigo-950 hover:bg-indigo-900 text-white"
      } ${className}`}
    >
      {busy ? "..." : subscribed ? "✓ We'll notify you" : "🔔 Notify me when available"}
    </button>
  );
}
