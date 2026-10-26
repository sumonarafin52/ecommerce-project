// components/product/RecommendedGrid.jsx
"use client";

// A row of suggestions for this shopper.
//
// It used to fetch /api/products?limit=100 and rank the result in the
// browser — a large payload on a phone, and a ranking that quietly became
// meaningless past a hundred products, since everything beyond the first
// hundred simply never entered the running.
//
// Now it sends the handful of ids the shopper has looked at and renders
// what comes back. The heading says why these were chosen, because
// "Recommended for you" over what is really a list of best sellers teaches
// people to ignore the row.
import { useEffect, useState } from "react";
import ProductCard from "@/components/product/ProductCard";

export default function RecommendedGrid({ seedIds = null, heading = "", limit = 8 }) {
  const [recs, setRecs] = useState([]);
  const [label, setLabel] = useState("");

  useEffect(() => {
    // Caller-supplied seeds (the cart passes what's in the basket) win over
    // browsing history.
    let seeds = seedIds;
    if (!seeds) {
      try {
        seeds = JSON.parse(localStorage.getItem("sm_viewed") || "[]").map((v) => v.id);
      } catch {
        // Private browsing, cleared site data, storage disabled — a shopper
        // the browser can tell us nothing about still gets best sellers.
        seeds = [];
      }
    }

    let cancelled = false;
    fetch("/api/products/recommended", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedIds: seeds, limit }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled || !res?.success) return;
        setRecs(res.data.products);
        setLabel(res.data.label);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [seedIds, limit]);

  if (recs.length === 0) return null;

  return (
    <section>
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-indigo-950 mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-gold rounded-full" />
        {heading || label || "You might like"}
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {recs.map((p) => (
          <div key={p._id} className="w-40 sm:w-48 shrink-0 snap-start">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
