// lib/productSlug.js
//
// Deciding a product's slug, in the one place both the create and the update
// route can call.
//
// Kept apart from lib/slug.js (which is pure string work, no database) so
// the slugifier stays testable on its own and this file owns the collision
// query.
import Product from "@/models/Product";
import { slugify, uniqueSlug } from "@/lib/slug";

/**
 * The slug to store for a product.
 *
 * `requested` is what staff typed in the SEO field, if anything; it's
 * slugified rather than trusted, so a pasted title or a URL with spaces and
 * capitals still produces a valid slug instead of a broken link.
 *
 * `excludeId` is the product being edited: without it, saving a product
 * without touching its name would see its own slug as taken and bump it to
 * "-2" on every save, quietly breaking links each time.
 */
export async function resolveSlug({ requested, name, excludeId = null, fallback = "" }) {
  const wanted = slugify(requested) || slugify(name);

  const isTaken = async (candidate) => {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    return !!(await Product.exists(filter));
  };

  // A name with nothing slug-able in it (emoji, punctuation only) falls back
  // to the product's id, which is unique by construction.
  return uniqueSlug(wanted, isTaken, { fallback: fallback || String(excludeId || "") });
}

/**
 * Gives a slug to every product that doesn't have one.
 *
 * Products created before slugs existed have none, and their URLs keep
 * working by id — but they'd never get a readable URL and would be left out
 * of the canonical redirect. This is safe to run repeatedly: it only touches
 * products with no slug, and never changes one that already exists.
 *
 * Returns how many it filled in, so a caller can log or report it.
 */
export async function backfillProductSlugs({ limit = 5000 } = {}) {
  const pending = await Product.find({ $or: [{ slug: { $exists: false } }, { slug: "" }, { slug: null }] })
    .select("_id name")
    .limit(limit)
    .lean();

  let filled = 0;
  for (const p of pending) {
    // One at a time, not a bulk write: each slug has to be checked against
    // the ones assigned a moment ago, or two products with the same name
    // would both be given the same slug and the unique index would reject
    // the second — losing it from the batch.
    const slug = await resolveSlug({ name: p.name, excludeId: p._id, fallback: String(p._id) });
    try {
      await Product.updateOne({ _id: p._id }, { $set: { slug } });
      filled++;
    } catch (err) {
      // A duplicate-key race (two processes backfilling at once) is not
      // worth failing the whole run for — the other process got there first.
      if (err?.code !== 11000) throw err;
    }
  }
  return filled;
}
