// app/sitemap.js
//
// Previously listed only five fixed URLs — no products or categories at all,
// but /cart, /login and /register (pages with no search value). Search
// engines had no sitemap route to a single product page.
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { getStorefrontCategories } from "@/lib/categories";
import { INFO_PAGES } from "@/lib/pageTemplates";
import { productPath } from "@/lib/productLookup";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap() {
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();

  const fixed = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...Object.values(INFO_PAGES).map((p) => ({
      url: `${base}${p.path}`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    })),
  ];

  let products = [];
  let categories = [];
  try {
    await connectDB();
    [products, categories] = await Promise.all([
      // public only: unlisted/draft/private products must never be advertised
      Product.find({ status: "public" }).select("_id slug updatedAt").sort({ updatedAt: -1 }).limit(45000).lean(),
      getStorefrontCategories(),
    ]);
  } catch {
    // an unavailable DB still yields a valid sitemap of the fixed pages
  }

  return [
    ...fixed,
    ...categories.map((c) => ({
      url: `${base}/products?category=${encodeURIComponent(c.name)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    })),
    ...products.map((p) => ({
      // the slug URL, since the id URL now redirects to it — a sitemap
      // full of redirects wastes crawl budget
      url: `${base}${productPath(p)}`,
      lastModified: p.updatedAt || now,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ];
}
