// components/product/RecommendedGrid.jsx
"use client";

import { useEffect, useState } from "react";
import ProductCard from "@/components/product/ProductCard";

export default function RecommendedGrid() {
  const [recs, setRecs] = useState([]);

  useEffect(() => {
    fetch("/api/products?limit=100")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return;
        const products = res.data.products;

        let viewed = [];
        let searches = [];
        try {
          viewed = JSON.parse(localStorage.getItem("sm_viewed") || "[]");
          searches = JSON.parse(localStorage.getItem("sm_searches") || "[]");
        } catch {}

        let recsList = [];

        // prioritize products from categories the visitor already viewed
        if (viewed.length) {
          const cats = new Set(viewed.map((v) => v.category));
          const viewedIds = new Set(viewed.map((v) => v.id));
          recsList = products.filter((p) => cats.has(p.category) && !viewedIds.has(p._id));
        }

        // then products matching recent search terms
        if (recsList.length === 0 && searches.length) {
          const terms = searches.map((s) => s.toLowerCase());
          recsList = products.filter((p) =>
            terms.some(
              (t) => p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t)
            )
          );
        }

        // fallback: top reviewed products
        if (recsList.length === 0) {
          recsList = [...products].sort((a, b) => b.numReviews - a.numReviews);
        }

        setRecs(recsList.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  if (recs.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-accent rounded-full" />
        Your choice products
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