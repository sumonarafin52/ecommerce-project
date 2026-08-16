// app/products/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import ProductGrid from "@/components/product/ProductGrid";
import { searchProducts } from "@/lib/productSearch";

export const dynamic = "force-dynamic";

const sortOptions = [
  { key: "new", label: "Newest" },
  { key: "top", label: "Top Selling" },
  { key: "price-low", label: "Price: Low to High" },
  { key: "price-high", label: "Price: High to Low" },
];

const priceBands = [
  { label: "Under ৳500", min: 0, max: 500 },
  { label: "৳500 – ৳1,500", min: 500, max: 1500 },
  { label: "৳1,500 – ৳5,000", min: 1500, max: 5000 },
  { label: "Above ৳5,000", min: 5000, max: 0 },
];

const PAGE_SIZE = 24;

export default async function ProductsPage({ searchParams }) {
  await connectDB();

  const search = (searchParams.search || "").trim();
  const category = searchParams.category || "";
  const brand = searchParams.brand || "";
  const deals = searchParams.deals === "1";
  const inStock = searchParams.instock === "1";
  const min = parseFloat(searchParams.min) || 0;
  const max = parseFloat(searchParams.max) || 0;
  const minRating = parseFloat(searchParams.rating) || 0;
  const page = Math.max(1, parseInt(searchParams.page) || 1);

  // Category counts + brand list come from lightweight aggregate/distinct
  // queries scoped to public products — not from pulling the whole catalog
  // into memory just to tally it, which is what this page used to do (and
  // which also meant draft/private/unlisted products were being counted
  // and, worse, actually rendered to every visitor with no status filter
  // at all).
  const [categoryCounts, brands, { products, total, totalPages, didYouMean }] = await Promise.all([
    Product.aggregate([{ $match: { status: "public" } }, { $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Product.distinct("brand", { status: "public", brand: { $ne: "" } }),
    searchProducts({
      params: {
        q: search,
        category,
        brand,
        stock: inStock ? "in" : "",
        minPrice: min || undefined,
        maxPrice: max || undefined,
        minRating: minRating || undefined,
        discounted: deals ? "1" : undefined,
        sort: searchParams.sort || undefined, // only forward an explicit choice, so relevance ranking can kick in for a fresh search — see lib/productSearch.js
      },
      canManage: false, // public storefront — always public-only, regardless of who's browsing
      page,
      limit: PAGE_SIZE,
    }),
  ]);
  const totalPublic = categoryCounts.reduce((sum, c) => sum + c.count, 0);
  const sort = searchParams.sort || "new"; // local default, just for highlighting the active chip below

  // keep current filters while changing one param
  const buildUrl = (overrides) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (brand) params.set("brand", brand);
    if (deals) params.set("deals", "1");
    if (inStock) params.set("instock", "1");
    if (min) params.set("min", String(min));
    if (max) params.set("max", String(max));
    if (minRating) params.set("rating", String(minRating));
    if (sort !== "new") params.set("sort", sort);
    Object.entries(overrides).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
    // any filter change resets pagination
    if (!("page" in overrides)) params.delete("page");
    const q = params.toString();
    return `/products${q ? `?${q}` : ""}`;
  };

  const clearFiltersUrl = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const q = params.toString();
    return `/products${q ? `?${q}` : ""}`;
  };

  const title = search
    ? `Results for "${search}"`
    : category
    ? category
    : deals
    ? "Today's Deals"
    : "All Products";

  const filterRow = (checked, label, href) => (
    <Link href={href} className="flex items-center gap-2.5 text-[13.5px] text-ink-soft hover:text-indigo-900 py-1">
      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-indigo-900 border-indigo-900" : "border-line"}`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </Link>
  );

  const hasActiveFilters = category || brand || deals || inStock || min || max || minRating;

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-7xl mx-auto px-4">
        <nav className="text-[13px] text-ink-muted py-4 flex items-center gap-2">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span>›</span>
          <span className="text-ink">All Products</span>
        </nav>

        <div className="grid lg:grid-cols-[250px_1fr] gap-7 pb-14">
          {/* filters sidebar */}
          <aside className="bg-cream-white border border-line rounded-xl p-5 h-fit lg:sticky lg:top-4">
            <h4 className="text-[13.5px] font-bold text-ink pb-2.5 border-b border-line mb-3.5">Filters</h4>

            <div className="mb-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Category</p>
              {filterRow(!category, `All (${totalPublic})`, buildUrl({ category: null }))}
              {categoryCounts.map((c) => filterRow(category === c._id, `${c._id} (${c.count})`, buildUrl({ category: c._id })))}
            </div>

            {brands.length > 0 && (
              <div className="mb-5">
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Brand</p>
                {filterRow(!brand, "All brands", buildUrl({ brand: null }))}
                {brands.map((b) => filterRow(brand === b, b, buildUrl({ brand: b })))}
              </div>
            )}

            <div className="mb-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Price Range</p>
              {priceBands.map((b) =>
                filterRow(
                  min === b.min && max === b.max,
                  b.label,
                  buildUrl({ min: b.min || null, max: b.max || null })
                )
              )}
            </div>

            <div className="mb-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Customer Rating</p>
              {[4, 3].map((r) =>
                filterRow(minRating === r, `${"★".repeat(r)} & up`, buildUrl({ rating: r }))
              )}
            </div>

            <div className="mb-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Availability</p>
              {filterRow(inStock, "In stock only", buildUrl({ instock: inStock ? null : "1" }))}
            </div>

            <div className="mb-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Deals</p>
              {filterRow(deals, "On Sale", buildUrl({ deals: deals ? null : "1" }))}
            </div>

            {hasActiveFilters && (
              <Link href={clearFiltersUrl()} className="block text-center border border-line hover:border-indigo-700 text-ink-soft font-bold text-xs py-2 rounded-lg">
                Clear filters
              </Link>
            )}
          </aside>

          {/* main */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h1 className="font-display text-xl font-semibold text-indigo-950">{title}</h1>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  {total} product{total === 1 ? "" : "s"} found
                  {didYouMean && search && <span className="text-gold-dark ml-2">— showing closest matches to "{search}"</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-ink-muted font-bold">Sort:</span>
                {sortOptions.map((o) => (
                  <Link
                    key={o.key}
                    href={buildUrl({ sort: o.key === "new" ? null : o.key })}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      sort === o.key
                        ? "bg-indigo-900 text-white border-indigo-900"
                        : "border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900"
                    }`}
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
            </div>

            <ProductGrid products={products} emptyMessage="No products match your filter" />

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-8">
                <Link
                  href={buildUrl({ page: Math.max(1, page - 1) })}
                  aria-disabled={page <= 1}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
                >
                  ← Prev
                </Link>
                <span className="text-xs text-ink-muted px-2">Page {page} of {totalPages}</span>
                <Link
                  href={buildUrl({ page: Math.min(totalPages, page + 1) })}
                  aria-disabled={page >= totalPages}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
                >
                  Next →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
