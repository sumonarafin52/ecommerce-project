// components/product/ProductGrid.jsx
import ProductCard from "@/components/product/ProductCard";

// `emptyState` replaces the one-line message for places that can offer the
// shopper somewhere to go next (a search that found nothing, above all).
// Everywhere else keeps the plain sentence — one empty-state frame, not
// two components that look almost alike.
export default function ProductGrid({ products = [], emptyMessage = "No products found", emptyState = null }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-16 px-5 text-ink-muted border border-dashed border-line rounded-xl bg-cream-alt/40">
        {emptyState || emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4 2xl:gap-5">
      {products.map((p) => (
        <ProductCard key={p._id} product={p} />
      ))}
    </div>
  );
}