// lib/categories.js
import Category from "@/models/Category";
import Product from "@/models/Product";

/**
 * Categories to show shoppers.
 *
 * Admin-created categories come first (they carry an image and a sort
 * order). After them, any category name actually used by a public product
 * but never created in Admin → Categories is added too. Previously those
 * were invisible: a store whose products said "Ice Cream" but had no
 * matching Category document showed an empty category bar and no category
 * section at all, even though the products were there.
 *
 * Storefront only — the admin category manager must keep listing real
 * documents, since these synthesised entries can't be edited or deleted.
 */
export async function getStorefrontCategories(limit = 0) {
  const [docs, usedNames] = await Promise.all([
    Category.find().sort({ order: 1, name: 1 }).lean(),
    Product.distinct("category", { status: "public", category: { $nin: [null, ""] } }),
  ]);

  const known = new Set(docs.map((d) => d.name.trim().toLowerCase()));
  const extra = usedNames
    .map((n) => String(n).trim())
    .filter((n) => n && !known.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ _id: `name:${name}`, name, image: "", derived: true }));

  const all = [...docs, ...extra];
  return limit > 0 ? all.slice(0, limit) : all;
}
