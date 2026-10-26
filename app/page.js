// app/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Settings from "@/models/Settings";
import { getStorefrontCategories } from "@/lib/categories";
import { categoryIcon } from "@/lib/categoryIcons";
import Icon from "@/components/ui/Icon";
import HeroSlider from "@/components/ui/HeroSlider";
import ProductGrid from "@/components/product/ProductGrid";
import ProductCard from "@/components/product/ProductCard";
import RecommendedGrid from "@/components/product/RecommendedGrid";
import { getEffectivePrice, getTotalStock, getDiscountPercentage } from "@/lib/utils";

// Resolves one admin-configured homepage section (Settings → General →
// Homepage Sections) into { title, buttonText, buttonLink, products }.
// Falls back gracefully (empty products) if the configured source no
// longer matches anything, so a stale admin config never crashes the page.
async function resolveSection(section, products) {
  let items = [];
  switch (section.type) {
    case "topSelling":
      items = [...products].sort((a, b) => b.numReviews - a.numReviews).slice(0, 8);
      break;
    case "deals":
      items = products.filter((p) => p.discountPrice > 0).slice(0, 8);
      break;
    case "underPrice":
      items = products.filter((p) => getEffectivePrice(p) <= (section.maxPrice || 0)).slice(0, 8);
      break;
    case "category": {
      if (section.categoryId) {
        const cat = await Category.findById(section.categoryId).lean().catch(() => null);
        if (cat) items = products.filter((p) => p.category?.toLowerCase() === cat.name.toLowerCase()).slice(0, 8);
      }
      break;
    }
    case "manual": {
      const ids = (section.productIds || []).map(String);
      const byId = new Map(products.map((p) => [String(p._id), p]));
      items = ids.map((id) => byId.get(id)).filter(Boolean);
      break;
    }
    case "newArrivals":
    default:
      items = products.slice(0, 8);
  }
  return {
    title: section.title,
    buttonText: section.buttonText || "See all",
    buttonLink: section.buttonLink || "/products",
    products: items,
  };
}

export const dynamic = "force-dynamic";

// Cap a showcase at a size that divides evenly into the responsive grid.
function fullRows(list, max = 12) {
  // 12 divides evenly into the 2-, 3-, 4- and 6-column layouts the grid
  // uses at different screen widths, so a full showcase never leaves an
  // orphan card at those sizes.
  return list.slice(0, max);
}


// The four things a first-time buyer wants to know before paying cash at
// their door. Each one is a fact, not a slogan.
const perks = [
  { title: "Delivered nationwide", sub: "Every one of the 64 districts", icon: "truck" },
  { title: "Pay when it arrives", sub: "Cash on delivery or online", icon: "shield" },
  { title: "7 days to return it", sub: "Changed your mind is a reason", icon: "returns" },
  { title: "A person replies", sub: "Not a bot, not a queue", icon: "headset" },
];

// The eyebrow is gone on purpose: a tracked-out capital label above every
// heading is decoration pretending to be structure, and it pushed the real
// heading down the page. The arrow after the link is gone for the same
// reason — a link already looks like a link.
function SectionTitle({ title, href, label }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-5">
      <h2 className="font-display text-2xl font-semibold text-indigo-950">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-[13.5px] font-semibold text-indigo-900 underline decoration-gold decoration-2 underline-offset-[6px] hover:decoration-indigo-900 transition-colors duration-ui ease-ui shrink-0"
        >
          {label || "See all"}
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  await connectDB();
  const raw = await Product.find({ status: "public" }).sort({ createdAt: -1 }).limit(60).lean();
  const products = JSON.parse(JSON.stringify(raw));
  const rawCategories = await getStorefrontCategories(12);
  const countRows = await Product.aggregate([
    { $match: { status: "public" } },
    { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ["$category", ""] } } } }, n: { $sum: 1 } } },
  ]);
  const categoryCounts = Object.fromEntries(countRows.map((r) => [r._id, r.n]));
  const categories = JSON.parse(JSON.stringify(rawCategories));

  const settingsDoc = await Settings.findOne().lean().catch(() => null);
  const storeName = settingsDoc?.general?.storeName || "Online Store";
  const siteUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  // describe only the payment options checkout really offers
  const codOn = settingsDoc?.payment?.cod ? settingsDoc.payment.cod.enabled !== false : true;
  const onlineOn = !!settingsDoc?.payment?.sslcommerz?.enabled;
  const paymentLine =
    codOn && onlineOn ? "Cash on delivery or online" : onlineOn ? "bKash, Nagad & cards" : "Cash on delivery";
  const homepage = settingsDoc?.homepage || {};
  const heroSlides = homepage.heroSlides || [];
  const activeBanners = (homepage.banners || []).filter((b) => b.active !== false).sort((a, b) => a.order - b.order);
  const visibleSections = (homepage.sections || []).filter((s) => s.visible !== false).sort((a, b) => a.order - b.order);
  const customSections = await Promise.all(visibleSections.map((s) => resolveSection(s, products)));
  const showDeals = homepage.showDeals !== false;
  const showBestSellers = homepage.showBestSellers !== false;

  // Showcases only feature things a customer can actually buy right now —
  // an out-of-stock item in "Today's Deals" wastes prime space on a dead end.
  const buyable = products.filter((p) => getTotalStock(p) > 0);
  const sliderProducts = [...buyable].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 5);
  const deals = fullRows(buyable.filter((p) => p.discountPrice > 0 && p.discountPrice < p.price));
  const maxDealPct = deals.reduce((m, p) => Math.max(m, getDiscountPercentage(p)), 0);
  const topSelling = fullRows([...buyable].sort((a, b) => b.numReviews - a.numReviews));
  const newArrivals = products.slice(0, 8);

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      {/* Tells search engines what this store is, and enables the
          search box Google can show under the store's name in results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: storeName,
              url: siteUrl || undefined,
              potentialAction: {
                "@type": "SearchAction",
                target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/products?search={search_term_string}` },
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: storeName,
              url: siteUrl || undefined,
              logo: settingsDoc?.general?.storeLogo || undefined,
              email: settingsDoc?.general?.storeEmail || undefined,
              telephone: settingsDoc?.general?.storePhone || undefined,
            },
          ]).replace(/</g, "\\u003c"),
        }}
      />
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 pt-6 space-y-14 pb-14">
        <HeroSlider products={sliderProducts} customSlides={heroSlides} />

        {/* categories */}
        {categories.length > 0 && (
          <section>
            <SectionTitle title="Shop by category" href="/products" label="All products" />
            {/* auto-fill with a 1fr max: with few categories the cards
                stretch to fill the row instead of huddling in one corner;
                with many they wrap into an even grid */}
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
              {categories.map((c) => {
                const count = categoryCounts[c.name.trim().toLowerCase()] || 0;
                return (
                  <Link
                    key={c._id}
                    href={`/products?category=${encodeURIComponent(c.name)}`}
                    className="group flex items-center gap-2.5 sm:gap-3.5 bg-cream-white border border-line rounded-r-md p-2.5 sm:p-4 shadow-e1 transition-[border-color,box-shadow] duration-ui ease-ui hover:border-gold hover:shadow-e2"
                  >
                    <div className="w-11 h-11 sm:w-14 sm:h-14 shrink-0 rounded-r-sm overflow-hidden bg-cream-alt flex items-center justify-center">
                      {c.image ? (
                        <img src={c.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                      ) : (
                        <Icon
                          name={categoryIcon(c.name)}
                          size={26}
                          className="text-indigo-950 sm:w-8 sm:h-8"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[13.5px] sm:text-[15px] font-bold text-ink leading-snug line-clamp-2 group-hover:text-indigo-900">{c.name}</span>
                      <span className="block text-[12px] text-ink-muted mt-0.5 tabular-nums">
                        {count > 0 ? `${count} ${count === 1 ? "item" : "items"}` : "Coming soon"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* admin-configured promo banners */}
        {activeBanners.length > 0 && (
          <div className={`grid gap-4 ${activeBanners.length === 1 ? "grid-cols-1" : "sm:grid-cols-2"}`}>
            {activeBanners.map((b) => (
              <Link
                key={b._id}
                href={b.link || "/products"}
                className="relative rounded-2xl overflow-hidden border border-line aspect-[3/1] bg-cream-alt group"
              >
                {b.image && (
                  <img src={b.image} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                )}
                {b.title && (
                  <span className="absolute bottom-4 left-5 text-white font-display font-bold text-xl drop-shadow-lg">{b.title}</span>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* One band divided by rules, not four identical cards: these are
            four facts about a single promise, not four separate offers. */}
        <div className="border-y border-line">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y divide-line lg:divide-y-0 lg:divide-x">
            {perks.map((p) => (p.title === "Pay when it arrives" ? { ...p, sub: paymentLine } : p)).map((p) => (
              <div key={p.title} className="flex items-start gap-3 py-5 lg:px-6 lg:first:pl-0 lg:last:pr-0">
                <Icon name={p.icon} size={20} className="text-gold-dark shrink-0 mt-[3px]" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-ink leading-snug">{p.title}</p>
                  <p className="text-[12.5px] text-ink-muted mt-1 leading-snug">{p.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showDeals && deals.length > 0 && (
          // Adaptive deals band. With only a few deals the promo panel grows
          // to fill the row (instead of leaving a mostly-empty grid); with
          // many, it stays compact and the products scroll sideways.
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-700 p-5 sm:p-8">
            <div className="absolute -right-20 -top-24 w-80 h-80 rounded-full bg-gold/10 blur-2xl" aria-hidden="true" />
            <div className="absolute -left-10 -bottom-28 w-72 h-72 rounded-full bg-white/5 blur-2xl" aria-hidden="true" />
            <div className="relative flex flex-col lg:flex-row gap-6 lg:items-stretch">
              <div
                className={`relative text-white flex flex-col justify-center shrink-0 ${
                  deals.length <= 3 ? "lg:flex-1" : "lg:w-[300px]"
                }`}
              >
                {/* when stretched, a large faint figure gives the open space a purpose */}
                {deals.length <= 3 && maxDealPct > 0 && (
                  <span
                    className="hidden lg:block absolute right-[6%] top-1/2 -translate-y-1/2 font-display font-bold leading-none text-[180px] 2xl:text-[230px] text-white/[0.06] select-none pointer-events-none"
                    aria-hidden="true"
                  >
                    -{maxDealPct}%
                  </span>
                )}
                <span className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-gold">On sale now</span>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold mt-2 leading-tight">Today&apos;s Deals</h2>
                {maxDealPct > 0 && (
                  <p className="mt-3 text-white/85 text-[15px]">
                    Save up to <span className="font-display text-2xl font-bold text-gold">{maxDealPct}%</span>{" "}
                    across {deals.length} {deals.length === 1 ? "item" : "items"}
                  </p>
                )}
                <Link
                  href="/products?deals=1"
                  className="mt-6 self-start bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-full text-sm transition-colors"
                >
                  See all deals →
                </Link>
              </div>
              <div className={`min-w-0 ${deals.length <= 3 ? "" : "flex-1"}`}>
                <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1">
                  {deals.map((p) => (
                    <div key={p._id} className="w-[200px] sm:w-[230px] 2xl:w-[250px] shrink-0 snap-start">
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {showBestSellers && topSelling.length > 0 && (
          <section>
            <SectionTitle title="Best Sellers" href="/products?sort=top" label="See all" />
            <ProductGrid products={topSelling} />
          </section>
        )}

        <RecommendedGrid />

        {customSections.length > 0 ? (
          customSections.map((sec, i) => (
            <section key={i}>
              <SectionTitle title={sec.title} href={sec.buttonLink} label={sec.buttonText} />
              <ProductGrid products={sec.products} />
            </section>
          ))
        ) : (
          <section>
            <SectionTitle title="New Arrivals" href="/products?sort=new" label="See all" />
            <ProductGrid products={newArrivals} />
          </section>
        )}
      </div>
    </div>
  );
}
