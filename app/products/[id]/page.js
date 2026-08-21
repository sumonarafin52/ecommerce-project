// app/products/[id]/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useCartStore from "@/store/cartStore";
import useWishlistStore from "@/store/wishlistStore";
import ProductGrid from "@/components/product/ProductGrid";
import { formatCurrency, getEffectivePrice, getDiscountPercentage } from "@/lib/utils";
import Reviews from "@/components/product/Reviews";

function Stars({ rating, count }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`w-4 h-4 ${n <= Math.round(rating) ? "text-gold" : "text-line"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
        </svg>
      ))}
      <span className="text-sm text-ink-muted ml-1">
        {rating.toFixed(1)} ({count} reviews)
      </span>
    </div>
  );
}

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const addItem = useCartStore((s) => s.addItem);

  const [product, setProduct] = useState(null);
  const wished = useWishlistStore((s) => (product ? s.has(product._id) : false));
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [selected, setSelected] = useState({});

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
        // variant auto-select: prottek option er prothom value
        if (p.options?.length) {
          const init = {};
          p.options.forEach((o) => {
            init[o.name] = o.values[0];
          });
          setSelected(init);
        } else setSelected({});
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

  // ===== MATCHED VARIANT COMBINATION =====
  const matchedCombo = useMemo(() => {
    if (!product?.combinations?.length || !product?.options?.length) return null;
    // every option type the product defines must be chosen — a partial
    // selection (e.g. Size picked but not Color) should not resolve to
    // some arbitrary combination that happens to match on Size alone
    const allSelected = product.options.every((opt) => selected[opt.name] !== undefined);
    if (!allSelected) return null;
    return (
      product.combinations.find(
        (c) => c.active !== false && Object.entries(selected).every(([k, v]) => (c.options || {})[k] === v)
      ) || null
    );
  }, [product, selected]);

  // variant onujayi price / stock / image
  const basePrice = product ? getEffectivePrice(product) : 0;
  const displayPrice = matchedCombo?.price ? matchedCombo.price : basePrice;
  const displayCompare = matchedCombo?.price ? matchedCombo.comparePrice || product?.price : product?.price;
  const hasDiscount = displayCompare > displayPrice;
  const discountPct = hasDiscount ? Math.round(((displayCompare - displayPrice) / displayCompare) * 100) : product ? getDiscountPercentage(product) : 0;
  const displayStock = matchedCombo ? matchedCombo.stock : product?.stock ?? 0;

  const baseImages = product?.images?.length ? product.images : [];
  const images = matchedCombo?.image
    ? [matchedCombo.image, ...baseImages.filter((i) => i !== matchedCombo.image)]
    : baseImages;

  useEffect(() => {
    setImageIndex(0);
  }, [matchedCombo?.key]);

  if (loading) {
    return (
      <div className="bg-cream-bg min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-cream-bg min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-ink">Product not found</p>
        <Link href="/products" className="text-indigo-900 hover:underline text-sm font-bold">
          Back to products
        </Link>
      </div>
    );
  }

  const outOfStock = displayStock <= 0;
  const needsSelection = product.options?.length > 0 && !matchedCombo;
  const missingOptions = needsSelection ? product.options.filter((o) => selected[o.name] === undefined).map((o) => o.name) : [];

  const handleAdd = () => {
    const item = matchedCombo
      ? {
          ...product,
          name: `${product.name} (${matchedCombo.key})`,
          price: displayPrice,
          discountPrice: 0,
          stock: matchedCombo.stock,
          combinationKey: matchedCombo.key,
        }
      : product;
    for (let i = 0; i < quantity; i++) addItem(item);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const handleBuyNow = () => {
    const item = matchedCombo
      ? {
          ...product,
          name: `${product.name} (${matchedCombo.key})`,
          price: displayPrice,
          discountPrice: 0,
          stock: matchedCombo.stock,
          combinationKey: matchedCombo.key,
        }
      : product;
    for (let i = 0; i < quantity; i++) addItem(item);
    router.push("/cart");
  };

  const handleWishlist = () => {
    if (!session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/products/${params.id}`)}`);
      return;
    }
    toggleWishlist(product._id);
  };

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
        <nav className="text-[13px] text-ink-muted flex items-center gap-2 flex-wrap">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span>›</span>
          <Link href="/products" className="hover:text-indigo-900">{product.category}</Link>
          <span>›</span>
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          {/* gallery */}
          <div className="space-y-3">
            <div className="relative aspect-square bg-cream-alt border border-line rounded-xl overflow-hidden">
              {images[imageIndex] ? (
                <img src={images[imageIndex]} alt={product.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-muted">No image</div>
              )}
              {discountPct > 0 && (
                <span className="absolute top-3 left-3 bg-brick text-white text-xs font-extrabold px-2.5 py-1 rounded">
                  -{discountPct}% OFF
                </span>
              )}
              {product.digitalProduct && (
                <span className="absolute top-3 right-3 bg-indigo-900 text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg">
                  ⚡ Digital
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setImageIndex(i)}
                    className={`w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 ${
                      i === imageIndex ? "border-indigo-900" : "border-line hover:border-indigo-700/50"
                    }`}
                  >
                    <img src={img} alt={`${product.name} ${i + 1}`} className="w-full h-full object-contain bg-cream-alt" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* info */}
          <div className="space-y-4">
            <span className="inline-block text-[11px] uppercase tracking-widest font-bold text-maroon">
              {product.category}
            </span>
            <h1 className="font-display text-2xl sm:text-[28px] font-semibold text-ink leading-snug">{product.name}</h1>
            <Stars rating={product.ratingAvg} count={product.numReviews} />

            {/* ===== VARIANT SELECTOR ===== */}
            {product.options?.length > 0 && (
              <div className="space-y-3.5 bg-cream-white border border-line rounded-xl p-4">
                {product.options.map((opt) => (
                  <div key={opt.name}>
                    <p className="text-xs font-bold text-ink-soft mb-1.5">
                      {opt.name}: <span className="text-indigo-900">{selected[opt.name]}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {opt.values.map((v) => (
                        <button
                          key={v}
                          onClick={() => setSelected((s) => ({ ...s, [opt.name]: v }))}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                            selected[opt.name] === v
                              ? "border-indigo-900 bg-indigo-100 text-indigo-900"
                              : "border-line text-ink-soft hover:border-indigo-700/50"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {matchedCombo && (
                  <p className="text-[11px] text-ink-muted border-t border-line pt-2">
                    Selected: <span className="font-bold text-ink">{matchedCombo.key}</span>
                    {matchedCombo.sku && <span className="ml-2 text-ink-muted">SKU: {matchedCombo.sku}</span>}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-baseline gap-3 py-4 border-y border-line">
              <span className="font-display text-[32px] font-bold text-indigo-900">{formatCurrency(displayPrice)}</span>
              {hasDiscount && (
                <span className="text-[15px] text-ink-muted line-through">{formatCurrency(displayCompare)}</span>
              )}
            </div>

            <p
              className={`text-sm font-bold ${
                outOfStock ? "text-brick" : displayStock <= 5 ? "text-gold-dark" : "text-green-700"
              }`}
            >
              {outOfStock
                ? "Out of stock"
                : displayStock <= 5
                ? `Only ${displayStock} left in stock`
                : "In stock"}
            </p>

            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-soft font-bold">Qty:</span>
              <div className="flex items-center border-[1.5px] border-line rounded-lg">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-9 h-[42px] text-ink-soft font-bold hover:bg-cream-alt disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm font-bold text-ink">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(Math.max(displayStock, 1), q + 1))}
                  disabled={quantity >= displayStock}
                  className="w-9 h-[42px] text-ink-soft font-bold hover:bg-cream-alt disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>

            {needsSelection && (
              <p className="text-xs font-semibold text-brick">
                Please select {missingOptions.join(" and ")} before adding to cart.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAdd}
                disabled={outOfStock || needsSelection}
                className={`flex-1 py-3.5 rounded-lg font-bold text-sm transition-colors ${
                  outOfStock || needsSelection
                    ? "bg-line text-ink-muted cursor-not-allowed"
                    : added
                    ? "bg-green-700 text-white"
                    : "bg-gold hover:bg-gold-dark text-indigo-950"
                }`}
              >
                {added ? "Added ✓" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={outOfStock || needsSelection}
                className="flex-1 py-3.5 rounded-lg font-bold text-sm bg-indigo-950 hover:bg-indigo-900 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy Now
              </button>
              <button
                onClick={handleWishlist}
                aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
                className="w-[52px] shrink-0 rounded-lg border-[1.5px] border-line hover:border-brick/40 flex items-center justify-center text-lg transition-colors"
              >
                {wished ? "❤️" : "🤍"}
              </button>
            </div>

            {product.digitalProduct && (
              <p className="text-xs text-indigo-900 bg-indigo-100 border border-indigo-700/20 rounded-lg px-3 py-2.5">
                ⚡ Digital product — payment er por download link paben
              </p>
            )}

            <ul className="text-xs text-ink-muted space-y-1.5 pt-2 border-t border-line">
              <li>• Free home delivery on every order</li>
              <li>• 7-day easy return policy</li>
              <li>• Secure payment via bKash, cards & SSLCommerz</li>
            </ul>
          </div>
        </div>

        <section className="bg-cream-white border border-line rounded-xl p-6">
          <h2 className="font-display text-lg font-semibold text-indigo-950 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-gold rounded-full" />
            Description
          </h2>
          <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">
            {product.description || "No description available."}
          </p>
        </section>

        <Reviews productId={product._id} />

        <section>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-indigo-950 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gold rounded-full" />
            You may also like
          </h2>
          <ProductGrid products={related} emptyMessage="No related products" />
        </section>
      </div>
    </div>
  );
}
