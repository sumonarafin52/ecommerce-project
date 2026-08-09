import ProductGrid from "@/components/product/ProductGrid";

export default function ProductsPage() {
  // TODO: /api/products থেকে data fetch করো (server component হিসেবে fetch করতে পারো)
  // TODO: Filter/sort sidebar এবং search bar এখানে যোগ করো
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">All Products</h1>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="md:col-span-1">
          {/* TODO: Filter sidebar code (category, price range) */}
          <p className="text-sm text-primary-light">Filters</p>
        </aside>
        <div className="md:col-span-3">
          <ProductGrid products={[]} />
        </div>
      </div>
    </div>
  );
}
