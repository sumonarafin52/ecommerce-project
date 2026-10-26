// app/products/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import ProductGrid from "@/components/product/ProductGrid";
import FilterLink from "@/components/product/FilterLink";
import MobileFilterSheet from "@/components/product/MobileFilterSheet";
import { searchProducts, searchFallbacks } from "@/lib/productSearch";
import Icon from "@/components/ui/Icon";
import { getT } from "@/lib/serverLang";
import Rating from "@/components/product/Rating";

export const dynamic = "force-dynamic";

// Distinct titles per category ("Ice Cream | SumonShop") instead of every
// listing sharing one title. Search and filtered-result pages are kept out
// of search engines — endless near-duplicate URLs dilute a store's ranking.
export function generateMetadata({ searchParams = {} }) {
  const category = (searchParams.category || "").trim().slice(0, 60);
  const search = (searchParams.search || "").trim().slice(0, 60);
  const filtered = ["brand", "minPrice", "maxPrice", "rating", "inStock", "deals", "sort", "page"].some((k) => searchParams[k]);

  if (search) {
    return { title: `Results for "${search}"`, robots: { index: false, follow: true } };
  }
  const title = category ? category : "All Products";
  return {
    title,
    description: category ? `Shop ${category} online — delivered across Bangladesh.` : "Browse every product in the store.",
    alternates: { canonical: category ? `/products?category=${encodeURIComponent(category)}` : "/products" },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

const sortOptions = [
  { key: "new", labelKey: "sortNewest" },
  { key: "top", labelKey: "sortTopSelling" },
  { key: "price-low", labelKey: "sortPriceLow" },
  { key: "price-high", labelKey: "sortPriceHigh" },
];

const priceBands = [
  { label: "Under ৳500", min: 0, max: 500 },
  { label: "৳500 – ৳1,500", min: 500, max: 1500 },
  { label: "৳1,500 – ৳5,000", min: 1500, max: 5000 },
  { label: "Above ৳5,000", min: 5000, max: 0 },
];

const PAGE_SIZE = 24;

export default async function ProductsPage({ searchParams }) {
  const t = getT();
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
    // $ne: "" does not exclude a product with no brand field at all —
    // undefined is not equal to "" — so the filter list grew a blank row
    // with an empty checkbox that filtered to nothing.
    Product.distinct("brand", { status: "public", brand: { $nin: ["", null], $exists: true } }),
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

  // Only when the page would otherwise be a dead end: what these words find
  // without the filters, and which of them find anything on their own.
  const fallbacks = total === 0 && search ? await searchFallbacks({ params: { q: search }, canManage: false }) : null;
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
    ? t("resultsFor", { q: search })
    : category
    ? category
    : deals
    ? t("todaysDeals")
    : t("allProducts");

  const filterRow = (checked, label, href) => (
    <FilterLink href={href} className="flex items-center gap-2.5 text-[13.5px] text-ink-soft hover:text-indigo-900 py-1">
      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-indigo-900 border-indigo-900" : "border-line"}`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </FilterLink>
  );

  // Boolean(), not a bare || chain: every one of these but `category` and
  // `brand` is a number or a boolean, so with no filters applied the chain
  // evaluated to the last falsy value — the number 0 — and `{0 && (...)}`
  // renders a literal "0" in the sidebar. React only skips `false`, `null`
  // and `undefined`.
  const hasActiveFilters = Boolean(category || brand || deals || inStock || min || max || minRating);

  // Filter controls, defined once and rendered in two places: the desktop
  // sidebar and the phone bottom sheet.
  const filterContent = (
    <>
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
              {[4, 3].map((r) => (
                <div key={r}>
                  {filterRow(
                    minRating === r,
                    <span className="flex items-center gap-1.5">
                      <Rating value={r} size={12} showEmpty={false} />& up
                    </span>,
                    buildUrl({ rating: r })
                  )}
                </div>
              ))}
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
              <FilterLink href={clearFiltersUrl()} className="block text-center border border-line hover:border-indigo-700 text-ink-soft font-bold text-xs py-2 rounded-lg">
                Clear filters
              </FilterLink>
            )}
    </>
  );
  const activeFilterCount = [category, brand, deals, inStock, min || max, minRating].filter(Boolean).length;

  // A shop loses the customer here, so this is never just a sentence: it
  // says what was not found, and every route out of it is a real link —
  // the same words without the filters, the words that DO find something,
  // and the catalogue. The counts come from the catalogue (searchFallbacks),
  // so nothing offered here leads to another empty page.
  const noResults = (
    <div className="max-w-sm mx-auto flex flex-col items-center">
      <Icon name="search" size={28} className="text-ink-muted/60 mb-3" />
      <p className="font-display text-base sm:text-lg font-semibold text-ink">
        {search ? t("noResultsFor", { q: search }) : t("noResultsFilters")}
      </p>
      {/* spelling advice only makes sense to someone who typed something */}
      {search && <p className="text-[13.5px] text-ink-muted mt-1.5">{t("checkSpelling")}</p>}

      {fallbacks?.terms?.length > 0 && (
        <div className="mt-5 w-full">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2">{t("tryInstead")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {fallbacks.terms.map(({ term, count }) => (
              <FilterLink
                key={term}
                href={`/products?search=${encodeURIComponent(term)}`}
                className="px-3 py-1.5 rounded-full text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors"
              >
                {term} <span className="text-ink-muted font-normal">({count})</span>
              </FilterLink>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {hasActiveFilters && fallbacks?.withoutFilters > 0 && (
          <FilterLink
            href={clearFiltersUrl()}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-900 text-white hover:bg-indigo-800 transition-colors"
          >
            {fallbacks.withoutFilters === 1 ? t("seeOneWithoutFilters") : t("seeWithoutFilters", { n: fallbacks.withoutFilters })}
          </FilterLink>
        )}
        {/* only worth its own button when it leaves the filters standing —
            with no filters on, clearing the search IS "browse all" */}
        {search && hasActiveFilters && (
          <FilterLink
            href={buildUrl({ search: null })}
            className="px-4 py-2 rounded-lg text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors"
          >
            {t("clearSearch")}
          </FilterLink>
        )}
        <Link
          href="/products"
          className="px-4 py-2 rounded-lg text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors"
        >
          {t("browseAll")}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        <nav className="text-[13px] text-ink-muted py-4 flex items-center gap-2">
          <Link href="/" className="hover:text-indigo-900">{t("home")}</Link>
          <span>›</span>
          <span className="text-ink">{title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-7 pb-14">
          {/* filters sidebar — desktop; phones get the same filters in a bottom sheet */}
          <aside className="hidden lg:block bg-cream-white border border-line rounded-xl p-5 h-fit lg:sticky lg:top-4">
            <h4 className="text-[13.5px] font-bold text-ink pb-2.5 border-b border-line mb-3.5">{t("filters")}</h4>
            {filterContent}
          </aside>

          {/* main */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h1 className="font-display text-xl font-semibold text-indigo-950">{title}</h1>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  {total === 1 ? t("oneProductFound") : t("productsFound", { n: total })}
                  {didYouMean && search && <span className="text-gold-dark ml-2">— showing closest matches to &quot;{search}&quot;</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 w-[calc(100%+2rem)] sm:w-auto sm:mx-0 sm:px-0 sm:flex-wrap">
                <MobileFilterSheet activeCount={activeFilterCount} total={total}>
                  {filterContent}
                </MobileFilterSheet>
                <span className="hidden sm:inline text-xs text-ink-muted font-bold">Sort:</span>
                {sortOptions.map((o) => (
                  <FilterLink
                    key={o.key}
                    href={buildUrl({ sort: o.key === "new" ? null : o.key })}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      sort === o.key
                        ? "bg-indigo-900 text-white border-indigo-900"
                        : "border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900"
                    }`}
                  >
                    {t(o.labelKey)}
                  </FilterLink>
                ))}
              </div>
            </div>

            <ProductGrid products={products} emptyState={noResults} />

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-8">
                <FilterLink
                  href={buildUrl({ page: Math.max(1, page - 1) })}
                  aria-disabled={page <= 1}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
                >
                  ← Prev
                </FilterLink>
                <span className="text-xs text-ink-muted px-2">Page {page} of {totalPages}</span>
                <FilterLink
                  href={buildUrl({ page: Math.min(totalPages, page + 1) })}
                  aria-disabled={page >= totalPages}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border border-line text-ink-soft hover:border-indigo-700 hover:text-indigo-900 transition-colors ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
                >
                  Next →
                </FilterLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
