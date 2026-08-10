// components/product/ProductGrid.jsx
import ProductCard from "@/components/product/ProductCard";

export default function ProductGrid({ products = [], emptyMessage = "No products found" }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400 border border-dashed border-white/10 rounded-lg">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {products.map((p) => (
        <ProductCard key={p._id} product={p} />
      ))}
    </div>
  );
}