// app/products/[id]/page.js
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useCartStore from "@/store/cartStore";
import ProductGrid from "@/components/product/ProductGrid";
import { formatCurrency, getEffectivePrice, getDiscountPercentage } from "@/lib/utils";

function Stars({ rating, count }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`w-4 h-4 ${n <= Math.round(rating) ? "text-accent" : "text-zinc-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
        </svg>
      ))}
      <span className="text-sm text-zinc-400 ml-1">
        {rating.toFixed(1)} ({count} reviews)
      </span>
    </div>
  );
}

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products/${params.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return null;
        const p = res.data;
        setProduct(p);
        setQuantity(1);
        setImageIndex(0);
        // remember for "Your choice products"
        try {
          const viewed = JSON.parse(localStorage.getItem("sm_viewed") || "[]");
          const rest = viewed.filter((v) => v.id !== p._id);
          localStorage.setItem(
            "sm_viewed",
            JSON.stringify([{ id: p._id, name: p.name, category: p.category }, ...rest].slice(0, 8))
          );
        } catch {}
        return fetch(`/api/products?category=${encodeURIComponent(p.category)}&limit=9`).then((r) =>
          r.json()
        );
      })
      .then((res) => {
        if (res?.success) setRelated(res.data.products.filter((p) => p._id !== params.id).slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Product not found</p>
        <Link href="/products" className="text-accent hover:underline text-sm">
          Back to products
        </Link>
      </div>
    );
  }

  const price = getEffectivePrice(product);
  const discount = getDiscountPercentage(product);
  const outOfStock = product.stock <= 0;
  const images = product.images?.length ? product.images : [];

  const handleAdd = () => {
    for (let i = 0; i < quantity; i++) addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const handleBuyNow = () => {
    for (let i = 0; i < quantity; i++) addItem(product);
    router.push("/cart");
  };

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
        <nav className="text-xs text-zinc-400">
          <Link href="/" className="hover:text-accent">Home</Link> /{" "}
          <Link href="/products" className="hover:text-accent">Products</Link> /{" "}
          <span className="text-zinc-200">{product.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          {/* gallery */}
          <div className="space-y-3">
            <div className="relative aspect-square bg-primary-light border border-white/10 rounded-xl overflow-hidden">
              {images[imageIndex] ? (
                <img
                  src={images[imageIndex]}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  No image
                </div>
              )}
              {discount > 0 && (
                <span className="absolute top-3 left-3 bg-accent text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                  -{discount}%
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setImageIndex(i)}
                    className={`w-16 h-16 shrink-0 rounded-md overflow-hidden border ${
                      i === imageIndex ? "border-accent" : "border-white/10 hover:border-white/40"
                    }`}
                  >
                    <img src={img} alt={`${product.name} ${i + 1}`} className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* info */}
          <div className="space-y-4">
            <span className="inline-block text-[11px] uppercase tracking-widest text-accent border border-accent/40 rounded-full px-3 py-1">
              {product.category}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{product.name}</h1>
            <Stars rating={product.ratingAvg} count={product.numReviews} />

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-accent">{formatCurrency(price)}</span>
              {discount > 0 && (
                <span className="text-sm text-zinc-500 line-through">{formatCurrency(product.price)}</span>
              )}
            </div>

            <p
              className={`text-sm font-bold ${
                outOfStock ? "text-red-400" : product.stock <= 5 ? "text-accent" : "text-green-400"
              }`}
            >
              {outOfStock
                ? "Out of stock"
                : product.stock <= 5
                ? `Only ${product.stock} left in stock`
                : "In stock"}
            </p>

            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-400">Qty:</span>
              <div className="flex items-center border border-white/15 rounded-md">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="px-3 py-1.5 text-white hover:bg-white/5 disabled:opacity-40"
                >
                  −
                </button>
                <span className="px-4 py-1.5 text-sm font-bold text-white">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  disabled={quantity >= product.stock}
                  className="px-3 py-1.5 text-white hover:bg-white/5 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAdd}
                disabled={outOfStock}
                className={`flex-1 py-3 rounded-md font-bold transition-colors ${
                  outOfStock
                    ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                    : added
                    ? "bg-green-600 text-white"
                    : "bg-accent hover:bg-accent/80 text-primary"
                }`}
              >
                {added ? "Added ✓" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={outOfStock}
                className="flex-1 py-3 rounded-md font-bold border border-accent text-accent hover:bg-accent hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy Now
              </button>
            </div>

            <ul className="text-xs text-zinc-400 space-y-1.5 pt-2 border-t border-white/10">
              <li>• Free home delivery on every order</li>
              <li>• 7-day easy return policy</li>
              <li>• Secure payment via bKash, cards & SSLCommerz</li>
            </ul>
          </div>
        </div>

        <section className="bg-primary-light border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-full" />
            Description
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
            {product.description || "No description available."}
          </p>
        </section>

        <section>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-accent rounded-full" />
            You may also like
          </h2>
          <ProductGrid products={related} emptyMessage="No related products" />
        </section>
      </div>
    </div>
  );
}