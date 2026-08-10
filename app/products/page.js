// app/products/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import ProductGrid from "@/components/product/ProductGrid";
import { getEffectivePrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

const chip = (active) =>
  `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
    active
      ? "bg-accent text-primary border-accent"
      : "border-white/15 text-zinc-300 hover:border-accent hover:text-accent"
  }`;

const sortOptions = [
  { key: "new", label: "Newest" },
  { key: "top", label: "Top Selling" },
  { key: "price-low", label: "Price: Low to High" },
  { key: "price-high", label: "Price: High to Low" },
];

export default async function ProductsPage({ searchParams }) {
  await connectDB();
  const raw = await Product.find().lean();
  let products = JSON.parse(JSON.stringify(raw));

  const search = (searchParams.search || "").trim().toLowerCase();
  const category = searchParams.category || "";
  const deals = searchParams.deals === "1";
  const max = parseFloat(searchParams.max) || 0;
  const sort = searchParams.sort || "new";

  if (search) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search) ||
        (p.description || "").toLowerCase().includes(search)
    );
  }
  if (category) products = products.filter((p) => p.category === category);
  if (deals) products = products.filter((p) => p.discountPrice > 0);
  if (max > 0) products = products.filter((p) => getEffectivePrice(p) <= max);

  if (sort === "top") products.sort((a, b) => b.numReviews - a.numReviews);
  else if (sort === "price-low")
    products.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  else if (sort === "price-high")
    products.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  else products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const categories = [...new Set(raw.map((p) => p.category))];

  // keep current filters while changing one param
  const buildUrl = (key, value) => {
    const params = new URLSearchParams();
    if (searchParams.search) params.set("search", searchParams.search);
    if (category) params.set("category", category);
    if (deals) params.set("deals", "1");
    if (max) params.set("max", searchParams.max);
    if (sort !== "new") params.set("sort", sort);
    if (value === null) params.delete(key);
    else params.set(key, value);
    const q = params.toString();
    return `/products${q ? `?${q}` : ""}`;
  };

  const title = search
    ? `Results for "${searchParams.search}"`
    : category
    ? category
    : deals
    ? "Today's Deals"
    : max
    ? `Under ৳${max}`
    : "All Products";

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-sm text-zinc-400 mt-1">{products.length} products found</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={buildUrl("category", null)} className={chip(!category)}>
            All
          </Link>
          {categories.map((c) => (
            <Link key={c} href={buildUrl("category", c)} className={chip(category === c)}>
              {c}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">Sort:</span>
          {sortOptions.map((o) => (
            <Link
              key={o.key}
              href={buildUrl("sort", o.key === "new" ? null : o.key)}
              className={chip(sort === o.key)}
            >
              {o.label}
            </Link>
          ))}
        </div>

        <ProductGrid products={products} emptyMessage="No products match your filter" />
      </div>
    </div>
  );
}