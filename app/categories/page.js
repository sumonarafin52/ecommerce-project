// app/categories/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { getStorefrontCategories } from "@/lib/categories";
import { categoryIcon } from "@/lib/categoryIcons";
import { getT } from "@/lib/serverLang";
import Icon from "@/components/ui/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories", description: "Browse every category in the store." };

export default async function CategoriesPage() {
  const t = getT();
  await connectDB();
  const [categories, countRows] = await Promise.all([
    getStorefrontCategories(),
    Product.aggregate([
      { $match: { status: "public" } },
      { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ["$category", ""] } } } }, n: { $sum: 1 } } },
    ]),
  ]);
  const counts = Object.fromEntries(countRows.map((r) => [r._id, r.n]));
  const total = countRows.reduce((s, r) => s + r.n, 0);

  const quick = [
    { href: "/products?deals=1", label: t("deals"), icon: "tag" },
    { href: "/products?sort=new", label: t("newArrivals"), icon: "spark" },
    { href: "/products?sort=top", label: t("popular"), icon: "flame" },
    { href: "/products?rating=4", label: t("topRated"), icon: "star" },
  ];

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-5 sm:py-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink">{t("categories")}</h1>
        <p className="text-sm text-ink-muted mt-1">{t("categoriesSummary", { p: total, c: categories.length })}</p>

        {/* quick shortcuts — horizontally swipeable chips on phones */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-5 -mx-4 px-4 sm:mx-0 sm:px-0">
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="shrink-0 flex items-center gap-1.5 bg-cream-white border border-line rounded-full px-4 py-2 text-sm font-semibold text-ink-soft active:scale-95 transition-transform hover:border-indigo-700/40"
            >
              <Icon name={q.icon} size={18} className="shrink-0" />
              {q.label}
            </Link>
          ))}
        </div>

        {categories.length === 0 ? (
          <div className="bg-cream-white border border-line rounded-xl text-center py-14 mt-6">
            <span className="text-4xl">🗂️</span>
            <p className="text-sm text-ink-muted mt-3">No categories yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 mt-6">
            <Link
              href="/products"
              className="group bg-indigo-900 rounded-2xl p-3 flex flex-col items-center justify-center text-center aspect-square active:scale-95 transition-transform"
            >
              <Icon name="shop" size={30} className="text-indigo-950 sm:w-9 sm:h-9" />
              <span className="mt-2 text-[12.5px] sm:text-sm font-bold text-white leading-tight">{t("allProducts")}</span>
              <span className="text-[11px] text-white/70">{total}</span>
            </Link>
            {categories.map((c) => {
              const n = counts[c.name.trim().toLowerCase()] || 0;
              return (
                <Link
                  key={c._id}
                  href={`/products?category=${encodeURIComponent(c.name)}`}
                  className="group bg-cream-white border border-line rounded-2xl p-3 flex flex-col items-center justify-center text-center aspect-square active:scale-95 hover:border-gold hover:shadow-premium transition-all"
                >
                  <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-gradient-to-br from-cream-bg to-gold-light/70 flex items-center justify-center">
                    {c.image ? (
                      <img src={c.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl sm:text-3xl" aria-hidden="true">{categoryIcon(c.name)}</span>
                    )}
                  </span>
                  <span className="mt-2 text-[12.5px] sm:text-sm font-bold text-ink leading-tight line-clamp-2">{c.name}</span>
                  {n > 0 && <span className="text-[11px] text-ink-muted">{n}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
