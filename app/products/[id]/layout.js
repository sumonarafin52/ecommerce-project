// app/products/[id]/layout.js
//
// Server-side metadata for product pages. The page itself is a client
// component (it can't export metadata), so without this every product
// shared on Facebook/WhatsApp showed the generic store title with no image
// or price, and Google saw identical titles on every product.
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { getEffectivePrice, getTotalStock } from "@/lib/utils";
import { findProductByParam, canonicalRedirect, productPath } from "@/lib/productLookup";
import { permanentRedirect, notFound } from "next/navigation";

async function loadProduct(param) {
  try {
    await connectDB();
    return await findProductByParam(param, {
      select:
        "name slug description shortDescription images price discountPrice brand sku category status stock combinations ratingAvg numReviews",
      lean: true,
    });
  } catch {
    return null;
  }
}

// only public and unlisted products have a page anyone may preview
const isShareable = (p) => p && (p.status === "public" || p.status === "unlisted");

const plain = (s = "") => String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }) {
  const p = await loadProduct(params.id);
  // Draft/private: reveal nothing — not the name, price or image.
  if (!isShareable(p)) {
    return { title: "Product not found", robots: { index: false, follow: false } };
  }

  const price = getEffectivePrice(p);
  const description =
    (plain(p.shortDescription) || plain(p.description)).slice(0, 155) ||
    `Buy ${p.name} online at ৳${price.toLocaleString("en-BD")}.`;
  const image = p.images?.[0];
  const url = productPath(p);

  return {
    title: p.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${p.name} — ৳${price.toLocaleString("en-BD")}`,
      description,
      images: image ? [{ url: image, width: 1200, height: 1200, alt: p.name }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: p.name,
      description,
      images: image ? [image] : undefined,
    },
    // unlisted = reachable by link, but kept out of search engines
    robots: p.status === "unlisted" ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function ProductLayout({ children, params }) {
  const p = await loadProduct(params.id);

  // One address per product. An id URL — anything shared, bookmarked or
  // indexed before slugs existed — moves to the slug so the ranking follows
  // rather than splitting across two URLs for the same page.
  //
  // middleware.js does this first, as a real HTTP 308, and stays the one
  // that matters for crawlers. This is the backstop for a client-side
  // navigation, which never reaches middleware — and for the day someone
  // adds a loading.js above this segment again, which would put it back
  // inside a Suspense boundary and leave only a client-side redirect
  // possible here.
  const redirectTo = canonicalRedirect(params.id, p);
  if (redirectTo) permanentRedirect(redirectTo);

  // A URL matching no product is a 404, not a 200 page that says "Product
  // not found". The page below is a client component and would happily
  // render its own not-found message with a success status, which tells a
  // crawler the dead URL is a real page.
  //
  // This only works because the product listing's loading.js now sits in the
  // (listing) route group: while it was at app/products/ it wrapped this
  // segment in a Suspense boundary, the shell was flushed before this ran,
  // and the status line was already gone.
  //
  // Only a missing document counts. A draft or private product still exists,
  // and the page keeps deciding what staff versus shoppers may see.
  if (!p) notFound();

  let jsonLd = null;

  if (p && p.status === "public") {
    const base = process.env.NEXTAUTH_URL || "";
    const price = getEffectivePrice(p);
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      image: (p.images || []).slice(0, 5),
      description: (plain(p.shortDescription) || plain(p.description)).slice(0, 500) || p.name,
      sku: p.sku || undefined,
      category: p.category || undefined,
      brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
      offers: {
        "@type": "Offer",
        url: `${base}${productPath(p)}`,
        priceCurrency: "BDT",
        price: Number(price).toFixed(2),
        availability: getTotalStock(p) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
      },
      // Google only accepts ratings backed by real reviews — omit otherwise
      aggregateRating:
        p.numReviews > 0
          ? { "@type": "AggregateRating", ratingValue: Number(p.ratingAvg || 0).toFixed(1), reviewCount: p.numReviews }
          : undefined,
    };
  }

  // Breadcrumb trail for search results: Home › Category › Product
  const breadcrumb =
    p && p.status === "public"
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${process.env.NEXTAUTH_URL || ""}/` },
            ...(p.category
              ? [{ "@type": "ListItem", position: 2, name: p.category, item: `${process.env.NEXTAUTH_URL || ""}/products?category=${encodeURIComponent(p.category)}` }]
              : []),
            { "@type": "ListItem", position: p.category ? 3 : 2, name: p.name },
          ],
        }
      : null;

  return (
    <>
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }}
        />
      )}
      {jsonLd && (
        <script
          type="application/ld+json"
          // escape "<" so product text can never close the script tag
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      {children}
    </>
  );
}
