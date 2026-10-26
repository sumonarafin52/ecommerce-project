// lib/slug.js
//
// Turning a product name into the part of the URL a person can read.
//
// Until now every product lived at /products/6acb91104efd9ef5cf86bee3. That
// works, but it tells a shopper nothing, it looks untrustworthy when pasted
// into a chat, and search engines get no keyword signal from the URL — which
// matters for a store whose traffic is meant to come from search.
//
// The store sells in Bangladesh, so product names are often Bengali. A naive
// slugifier strips non-Latin characters and leaves an empty string, which
// would give every Bengali-named product the same slug. So Bengali is
// transliterated rather than discarded.

// Bengali → Latin, enough to produce a readable, stable URL. This is not a
// scholarly transliteration scheme; it only has to be consistent and
// recognisable.
// Every key is quoted: Bengali letters are not valid bare JS identifiers,
// and leaving them unquoted is a parse error rather than a runtime one.
const BENGALI = {
  "অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri",
  "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
  "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
  "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "n",
  "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
  "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
  "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
  "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh", "স": "s", "হ": "h",
  "ড়": "r", "ঢ়": "rh", "য়": "y", "ৎ": "t", "ং": "ng", "ঃ": "h", "ঁ": "",
  // vowel signs
  "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri",
  "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou", "্": "",
  // digits
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

const MAX_LENGTH = 70;

/**
 * A URL-safe slug for `text`, or "" when there's nothing usable in it.
 *
 * Returning "" rather than a placeholder is deliberate: the caller decides
 * what to fall back to, and a product must never silently get a slug like
 * "product" that then collides with every other unnameable product.
 */
export function slugify(text) {
  let s = String(text ?? "");

  // Transliterate before stripping, or a Bengali name becomes empty.
  s = s.replace(/[ঀ-৿]/g, (ch) => (ch in BENGALI ? BENGALI[ch] : ""));

  s = s
    .normalize("NFKD") // "café" → "cafe", not "caf"
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "A&W" shouldn't become "aw"; "7-up" should keep its hyphen
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length <= MAX_LENGTH) return s;
  // Cut on a word boundary so the slug doesn't end mid-word.
  const cut = s.slice(0, MAX_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > MAX_LENGTH / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/**
 * A slug that doesn't collide with anything already in the collection.
 *
 * `isTaken` is async so the caller decides how to look: usually a query
 * excluding the product being edited, so re-saving a product keeps its own
 * slug instead of being bumped to "-2" every time.
 *
 * A name with nothing slug-able in it (emoji, punctuation) falls back to the
 * product's own id, which is unique by construction and still a valid URL.
 */
export async function uniqueSlug(name, isTaken, { fallback = "" } = {}) {
  const base = slugify(name) || slugify(fallback) || "item";

  if (!(await isTaken(base))) return base;

  // Numbered suffixes, the convention shoppers and search engines expect.
  for (let i = 2; i <= 50; i++) {
    const candidate = `${base}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // 50 products with the same name is unusual enough that a short random
  // suffix is better than scanning forever.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** True when a string is a Mongo ObjectId rather than a slug. */
export function isObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || ""));
}

/**
 * The canonical URL path for a product.
 *
 * Lives here, with no database import, because client components link to
 * products too — pulling lib/productLookup (and through it mongoose) into a
 * client bundle would be a large and pointless download.
 *
 * Falls back to the id for a product with no slug yet, so nothing links to a
 * broken URL while the backfill is still running.
 */
export function productPath(product) {
  if (!product) return "/products";
  return `/products/${product.slug || product._id}`;
}
