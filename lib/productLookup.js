// lib/productLookup.js
//
// One place that knows a product can be addressed by either a slug or an id.
//
// Both have to keep working. Slugs are what we want in URLs from now on, but
// every link already shared, bookmarked, indexed by Google or saved in an
// old order points at an ObjectId, and those must not 404. Anything that
// resolves a product from a URL segment goes through here so the two forms
// can never drift apart.
import Product from "@/models/Product";
import { isObjectId, productPath } from "@/lib/slug";

// Re-exported so server code has one import for product addressing, while
// client components take productPath straight from lib/slug (no mongoose).
export { productPath };

/**
 * A mongoose filter matching `param`, whichever form it is.
 *
 * An id is matched by _id; anything else by slug. A slug is never looked up
 * as an id and vice versa, so a 24-hex slug (which slugify can produce from
 * a name that happens to be hex) still can't shadow another product's id.
 */
export function productFilter(param) {
  const value = String(param || "").trim();
  if (!value) return null;
  return isObjectId(value) ? { _id: value } : { slug: value.toLowerCase() };
}

/**
 * Finds a product by slug or id.
 *
 * `select` and `lean` are passed through so callers keep their own
 * projections — the metadata layout wants a handful of fields, the product
 * page wants everything.
 */
export async function findProductByParam(param, { select = "", lean = false } = {}) {
  const filter = productFilter(param);
  if (!filter) return null;
  let query = Product.findOne(filter);
  if (select) query = query.select(select);
  if (lean) query = query.lean();
  return query;
}

/**
 * Whether a request that arrived at `param` should be redirected, and where.
 *
 * An id URL for a product that has a slug is redirected to the slug so there
 * is exactly one indexable address per product; everything else stays put.
 *
 * Only for a product a visitor may actually open. A draft or private product
 * must not redirect: the Location header would carry its slug, which is made
 * from its name — so an unreleased product could be confirmed, and named,
 * by anyone who guessed its id. Those URLs stay where they are and the page
 * decides what to show.
 */
const OPENABLE = ["public", "unlisted"];

export function canonicalRedirect(param, product) {
  if (!product?.slug) return null;
  if (!OPENABLE.includes(product.status)) return null;
  if (String(param) === product.slug) return null;
  return productPath(product);
}
