// app/compare/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useCompareStore from "@/store/compareStore";
import useCartStore from "@/store/cartStore";
import SmartImage from "@/components/ui/SmartImage";
import { formatCurrency, getEffectivePrice, getTotalStock } from "@/lib/utils";

export default function ComparePage() {
  const ids = useCompareStore((s) => s.ids);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const addItem = useCartStore((s) => s.addItem);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // the persisted store rehydrates after mount — wait for it before fetching
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated) return;
    if (!ids.length) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/products/compare?ids=${ids.join(",")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return;
        setProducts(res.data);
        // drop anything that's no longer available so the list self-heals
        const live = new Set(res.data.map((p) => String(p._id)));
        ids.filter((id) => !live.has(id)).forEach(remove);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, ids.join(",")]);

  const prices = products.map(getEffectivePrice);
  const lowest = Math.min(...prices);
  const ratings = products.map((p) => p.ratingAvg || 0);
  const bestRating = Math.max(...ratings);

  const rows = [
    {
      label: "Price",
      render: (p) => {
        const price = getEffectivePrice(p);
        const best = products.length > 1 && price === lowest;
        return (
          <div>
            <span className={`font-display text-lg font-bold ${best ? "text-green-700" : "text-indigo-900"}`}>{formatCurrency(price)}</span>
            {p.discountPrice > 0 && p.discountPrice < p.price && (
              <span className="block text-xs text-ink-muted line-through">{formatCurrency(p.price)}</span>
            )}
            {best && <span className="block text-[11px] font-bold text-green-700 mt-0.5">Lowest price</span>}
          </div>
        );
      },
    },
    {
      label: "Rating",
      render: (p) =>
        p.numReviews > 0 ? (
          <span className={products.length > 1 && (p.ratingAvg || 0) === bestRating ? "font-bold text-green-700" : ""}>
            ★ {(p.ratingAvg || 0).toFixed(1)} <span className="text-ink-muted text-xs">({p.numReviews})</span>
          </span>
        ) : (
          <span className="text-ink-muted">No reviews yet</span>
        ),
    },
    {
      label: "Availability",
      render: (p) => {
        const stock = getTotalStock(p);
        return stock > 0 ? (
          <span className="text-green-700 font-semibold">{stock <= 5 ? `Only ${stock} left` : "In stock"}</span>
        ) : (
          <span className="text-brick font-semibold">Out of stock</span>
        );
      },
    },
    { label: "Brand", render: (p) => p.brand || <span className="text-ink-muted">—</span> },
    { label: "Category", render: (p) => [p.category, p.subcategory].filter(Boolean).join(" › ") || "—" },
    { label: "Weight", render: (p) => (p.weight ? `${p.weight} kg` : <span className="text-ink-muted">—</span>) },
    {
      label: "Options",
      render: (p) =>
        p.options?.length ? (
          <div className="space-y-1">
            {p.options.map((o) => (
              <p key={o.name} className="text-xs">
                <span className="font-semibold">{o.name}:</span> {(o.values || []).join(", ")}
              </p>
            ))}
          </div>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      label: "About",
      render: (p) => <p className="text-xs text-ink-soft line-clamp-4">{p.shortDescription || "—"}</p>,
    },
  ];

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Compare products</h1>
            <p className="text-sm text-ink-muted mt-1">Up to 4 products side by side.</p>
          </div>
          {products.length > 0 && (
            <button onClick={clear} className="text-sm font-bold text-brick hover:underline">
              Clear all
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1].map((i) => <div key={i} className="h-80 rounded-xl animate-pulse bg-line/60" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-cream-white border border-line rounded-xl text-center py-16 px-4">
            <span className="text-4xl">⚖️</span>
            <h2 className="font-display text-xl font-semibold text-ink mt-3">Nothing to compare yet</h2>
            <p className="text-sm text-ink-muted mt-2">Tap &ldquo;Compare&rdquo; on any product to add it here.</p>
            <Link
              href="/products"
              className="inline-block mt-6 bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg text-sm"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <div className="bg-cream-white border border-line rounded-xl overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-32 sm:w-40" />
                  {products.map((p) => (
                    <th key={p._id} className="p-4 align-top text-left border-l border-line">
                      <div className="relative">
                        <button
                          onClick={() => remove(p._id)}
                          className="absolute -top-1 -right-1 z-10 w-7 h-7 rounded-full bg-white shadow text-xs hover:text-brick"
                          aria-label={`Remove ${p.name}`}
                        >
                          ✕
                        </button>
                        <Link href={`/products/${p._id}`} className="block">
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-cream-alt mb-3">
                            {p.images?.[0] && (
                              <SmartImage src={p.images[0]} alt={p.name} sizes="220px" className="object-contain" />
                            )}
                          </div>
                          <p className="text-sm font-semibold text-ink line-clamp-2 hover:text-indigo-900">{p.name}</p>
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <th className="p-4 text-left text-[12px] font-bold uppercase tracking-wide text-ink-muted align-top">
                      {row.label}
                    </th>
                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-sm text-ink align-top border-l border-line">
                        {row.render(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <th />
                  {products.map((p) => {
                    const variants = p.options?.length > 0;
                    const inStock = getTotalStock(p) > 0;
                    return (
                      <td key={p._id} className="p-4 border-l border-line">
                        {variants ? (
                          <Link
                            href={`/products/${p._id}`}
                            className="block text-center bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs py-2.5 rounded-lg"
                          >
                            Select options
                          </Link>
                        ) : (
                          <button
                            onClick={() => addItem(p)}
                            disabled={!inStock}
                            className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold text-xs py-2.5 rounded-lg disabled:bg-line disabled:text-ink-muted"
                          >
                            {inStock ? "Add to cart" : "Out of stock"}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
