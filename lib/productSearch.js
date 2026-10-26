// lib/productSearch.js
//
// Single source of truth for building a product search/filter query and
// running it. Both app/api/products/route.js (admin panel, cart, related
// products) and app/products/page.js (the public storefront listing) call
// into this — previously the storefront page had its own parallel
// implementation that fetched the ENTIRE catalog with no status filter
// (leaking draft/private/unlisted products publicly) and did a much weaker
// in-memory .includes() search with no pagination. This fixes both.
import Product from "@/models/Product";

export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A query split into the words worth matching on. Capped so a pasted
// paragraph can't turn into forty regex conditions, and one-character
// fragments are dropped because they match almost everything.
export function searchTerms(q) {
  const raw = String(q || "").trim();
  if (!raw) return [];
  const terms = raw.split(/\s+/).filter((t) => t.length > 1);
  // A query of nothing but single characters ("a", "x y") would otherwise
  // produce no conditions at all — and a search that adds no conditions
  // quietly returns the whole catalogue, which looks like a broken filter
  // rather than a narrow one.
  return (terms.length ? terms : [raw]).slice(0, 8);
}

// Union of sort keys used by the admin panel and the storefront — kept in
// one place so a new sort option only needs adding once.
export const SORT_MAP = {
  newest: { createdAt: -1 },
  new: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  "price-low": { price: 1 },
  price_desc: { price: -1 },
  "price-high": { price: -1 },
  name: { name: 1 },
  updated: { updatedAt: -1 },
  rating: { ratingAvg: -1 },
  top: { numReviews: -1, ratingAvg: -1 },
};

/**
 * Builds a single Mongo filter from search params. Every independent
 * condition (text search, category, price range, stock, etc.) is combined
 * with $and — earlier code reused a single top-level `$or` for both the
 * text search and the "no images" filter, which silently turned
 * "q=shoe&noImages=1" into "matches shoe OR has no images" instead of
 * "matches shoe AND has no images". $and keeps each filter independent
 * regardless of how many are active at once.
 */
export function buildProductQuery(params, canManage) {
  const {
    // `search` is the name the storefront URL uses (/products?search=mug)
    // and the name in the site's own search schema; `q` is what the admin
    // and this library use. Accepting both means a caller that picks the
    // wrong one gets a search rather than the entire catalogue returned
    // silently, which is exactly how a filter looks broken.
    q: qParam = "",
    search = "",
    category = "",
    subcategory = "",
    brand = "",
    status = "",
    stock = "",
    minPrice,
    maxPrice,
    minRating,
    featured,
    discounted,
    noImages,
    hasVariants,
    tags,
    dateFrom,
    dateTo,
  } = params;

  const and = [];

  // VISIBILITY: admin/manager can see any status (or filter to one);
  // everyone else only ever sees public products.
  if (canManage) {
    if (status && ["public", "private", "draft", "unlisted"].includes(status)) and.push({ status });
  } else {
    and.push({ status: "public" });
  }

  const q = String(qParam || search || "").trim();

  if (q) {
    // One condition per word, not one regex for the whole string.
    //
    // The query used to be matched as a single literal substring, so a
    // shopper only found something if they typed the words in the same
    // order the catalogue happens to use them: "wireless mouse pro" found
    // the mouse, "mouse wireless" found nothing. It also meant a word from
    // one field could never combine with a word from another — "logitech
    // keyboard" matched nothing, because no single field contains both the
    // brand and the product name.
    //
    // Now every word has to appear somewhere (AND across words, OR across
    // fields), which is how people actually type.
    for (const term of searchTerms(q)) {
      const rx = new RegExp(escapeRegExp(term), "i");
      and.push({ $or: [{ name: rx }, { brand: rx }, { sku: rx }, { category: rx }, { subcategory: rx }, { tags: rx }, { description: rx }] });
    }
  }

  if (category) and.push({ category: new RegExp(escapeRegExp(category), "i") });
  if (subcategory) and.push({ subcategory: new RegExp(escapeRegExp(subcategory), "i") });
  if (brand) and.push({ brand: new RegExp(escapeRegExp(brand), "i") });

  if (stock === "out") and.push({ stock: { $lte: 0 } });
  else if (stock === "low") and.push({ $expr: { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] } });
  else if (stock === "in") and.push({ stock: { $gt: 0 } });

  if (minPrice || maxPrice) {
    const priceFilter = {};
    if (minPrice) priceFilter.$gte = Number(minPrice);
    if (maxPrice) priceFilter.$lte = Number(maxPrice);
    and.push({ price: priceFilter });
  }

  if (minRating) and.push({ ratingAvg: { $gte: Number(minRating) } });

  if (featured === "1") and.push({ featured: true });
  if (discounted === "1") and.push({ discountPrice: { $gt: 0 } });
  if (noImages === "1") and.push({ $or: [{ images: { $exists: false } }, { images: { $eq: [] } }] });
  if (hasVariants === "1") and.push({ "options.0": { $exists: true } });
  if (tags) and.push({ tags: { $in: tags.split(",").map((t) => t.trim()).filter(Boolean) } });

  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo + "T23:59:59");
    and.push({ createdAt: dateFilter });
  }

  return and.length ? { $and: and } : {};
}

// Plain Levenshtein edit distance — used only as a bounded fallback when a
// real search returns zero results, to catch typos ("iphonee" -> "iPhone")
// without needing a search engine/Atlas Search. No new dependency.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Typo tolerance, word by word.
//
// This runs only when the normal search found nothing, pulls a capped pool
// of small fields (no images, no description) and scores by edit distance —
// no search engine and no new dependency.
//
// It used to compare the WHOLE query against a WHOLE field, which worked
// for one misspelled word ("mose" -> "Mouse") and failed completely for
// anything longer: "cofee mug" scored the full string against "Ceramic
// Coffee Mug" and came back too far away, so a shopper who mistyped one
// letter of a two-word search got nothing at all. Now each word of the
// query is matched against each word of the product, so one bad word no
// longer sinks the query.
async function fuzzySearch(q, params, canManage, page, limit) {
  const terms = searchTerms(q).map((t) => t.toLowerCase());
  if (!terms.length) return null;

  // Everything the shopper narrowed to, minus the words themselves. This
  // used to be status-only, so the typo fallback quietly threw away the
  // filters: with Home selected, a search for "mouse" handed back an
  // Electronics mouse while the Home checkbox still showed as ticked.
  const { q: _q, search: _search, ...filters } = params || {};
  const baseQuery = buildProductQuery(filters, canManage);
  const candidates = await Product.find(baseQuery).select("name brand sku category tags").limit(500).lean();

  // How far a word may be from its target before it stops being a typo.
  // Short words get a tight budget: at distance 2, "mug" would reach "bag".
  const budget = (term) => (term.length <= 4 ? 1 : term.length <= 7 ? 2 : 3);

  const scored = candidates
    .map((p) => {
      const words = [p.name, p.brand, p.sku, p.category, ...(p.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .split(/[\s/_-]+/)
        .filter(Boolean);
      if (!words.length) return null;

      let total = 0;
      for (const term of terms) {
        // The closest any single word in the product comes to this term.
        // A word that merely contains the term (a prefix a shopper cut
        // short) counts as an exact hit.
        let best = Infinity;
        for (const w of words) {
          const d = w.includes(term) ? 0 : levenshtein(term, w);
          if (d < best) best = d;
          if (best === 0) break;
        }
        if (best > budget(term)) return null; // this word matched nothing
        total += best;
      }
      return { id: p._id, dist: total };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist);

  if (!scored.length) return null;

  const pageIds = scored.slice((page - 1) * limit, (page - 1) * limit + limit).map((s) => String(s.id));
  const products = await Product.find({ _id: { $in: pageIds } }).lean();
  const order = new Map(pageIds.map((id, i) => [id, i]));
  products.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

  return {
    products,
    total: scored.length,
    page,
    totalPages: Math.max(1, Math.ceil(scored.length / limit)),
    didYouMean: true,
  };
}

/**
 * What a shopper can try next when a search found nothing.
 *
 * A dead-end "no results" page is where a shop loses a customer who was
 * already holding their wallet, so the two questions worth answering are
 * both answered from the catalogue itself — never guessed:
 *
 *   withoutFilters — how many products these same words find once the
 *                    category/price/stock filters are dropped. Non-zero
 *                    means the filters, not the words, emptied the page.
 *   terms          — for a multi-word search, which individual words do
 *                    match something, and how much. "logitech bottle"
 *                    finds nothing, but "logitech" finds two.
 *
 * Only called on an empty result, so the extra counts cost nothing on the
 * normal path.
 */
export async function searchFallbacks({ params, canManage }) {
  const q = String(params.q || params.search || "").trim();
  if (!q) return { withoutFilters: 0, terms: [] };

  const withoutFilters = await Product.countDocuments(buildProductQuery({ q }, canManage));

  const words = searchTerms(q);
  let terms = [];
  if (words.length > 1) {
    const counts = await Promise.all(
      words.slice(0, 4).map(async (term) => ({
        term,
        count: await Product.countDocuments(buildProductQuery({ q: term }, canManage)),
      }))
    );
    terms = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  }

  return { withoutFilters, terms };
}

/**
 * Runs a product search/filter/sort/paginate in one call. When a text query
 * is present and no explicit sort was requested, results are ranked by
 * relevance (exact name match > name starts-with > name contains > brand/sku
 * match > category/description match), computed in the aggregation itself
 * rather than pulled into Node — this keeps it index-friendly and correct
 * under pagination (Node-side scoring would require pulling every matching
 * doc just to sort them).
 */
export async function searchProducts({ params, canManage, page = 1, limit = 12, sort }) {
  const query = buildProductQuery(params, canManage);
  // Same alias as buildProductQuery, so relevance ranking and the typo
  // fallback trigger for either spelling of the parameter.
  const q = String(params.q || params.search || "").trim();
  const requestedSort = sort || params.sort;
  const useRelevance = q && (!requestedSort || requestedSort === "relevance");

  let result;

  if (useRelevance) {
    const rx = new RegExp(escapeRegExp(q), "i");
    const startsWithRx = new RegExp(`^${escapeRegExp(q)}`, "i");
    const pipeline = [
      { $match: query },
      {
        $addFields: {
          _score: {
            $sum: [
              { $cond: [{ $eq: [{ $toLower: "$name" }, q.toLowerCase()] }, 100, 0] },
              { $cond: [{ $regexMatch: { input: "$name", regex: startsWithRx } }, 40, 0] },
              { $cond: [{ $regexMatch: { input: "$name", regex: rx } }, 20, 0] },
              { $cond: [{ $regexMatch: { input: "$brand", regex: rx } }, 15, 0] },
              { $cond: [{ $regexMatch: { input: "$sku", regex: startsWithRx } }, 15, 0] },
              { $cond: [{ $regexMatch: { input: "$category", regex: rx } }, 8, 0] },
              { $cond: [{ $regexMatch: { input: { $ifNull: ["$description", ""] }, regex: rx } }, 3, 0] },
            ],
          },
        },
      },
      { $sort: { _score: -1, createdAt: -1 } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          count: [{ $count: "total" }],
        },
      },
    ];
    const [agg] = await Product.aggregate(pipeline);
    const products = agg?.data || [];
    const total = agg?.count?.[0]?.total || 0;
    result = { products, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };

    if (total === 0) {
      const fuzzy = await fuzzySearch(q, params, canManage, page, limit);
      if (fuzzy) result = fuzzy;
    }
  } else {
    const sortSpec = SORT_MAP[requestedSort] || SORT_MAP.newest;
    const [products, total] = await Promise.all([
      Product.find(query).sort(sortSpec).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(query),
    ]);
    result = { products, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  return result;
}
