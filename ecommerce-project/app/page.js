// app/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Settings from "@/models/Settings";
import HeroSlider from "@/components/ui/HeroSlider";
import ProductGrid from "@/components/product/ProductGrid";
import RecommendedGrid from "@/components/product/RecommendedGrid";
import { getEffectivePrice } from "@/lib/utils";

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

const perks = [
  { title: "Free Home Delivery", sub: "On every order, nationwide", icon: "M3 7h11v8H3V7zm11 3h4l3 3v2h-7v-5zM7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" },
  { title: "Secure Payment", sub: "bKash, cards & SSLCommerz", icon: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" },
  { title: "Easy Returns", sub: "7-day return policy", icon: "M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-4M20 14a8 8 0 01-14 4" },
  { title: "24/7 Support", sub: "Call or email anytime", icon: "M4 12a8 8 0 0116 0v5a2 2 0 01-2 2h-2v-6h4M4 12v5a2 2 0 002 2h2v-6H4" },
];

function SectionTitle({ title, href, label, eyebrow }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        {eyebrow && <span className="block text-xs font-bold uppercase tracking-wide text-gold-dark mb-1.5">{eyebrow}</span>}
        <h2 className="font-display text-2xl font-semibold text-indigo-950">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="text-[13.5px] font-bold text-indigo-900 border-b-2 border-gold pb-0.5 shrink-0">
          {label || "See all"} →
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  await connectDB();
  const raw = await Product.find({ status: "public" }).sort({ createdAt: -1 }).limit(60).lean();
  const products = JSON.parse(JSON.stringify(raw));
  const rawCategories = await Category.find().sort({ order: 1, name: 1 }).limit(8).lean();
  const categories = JSON.parse(JSON.stringify(rawCategories));

  const settingsDoc = await Settings.findOne().lean().catch(() => null);
  const homepage = settingsDoc?.homepage || {};
  const heroSlides = homepage.heroSlides || [];
  const activeBanners = (homepage.banners || []).filter((b) => b.active !== false).sort((a, b) => a.order - b.order);
  const visibleSections = (homepage.sections || []).filter((s) => s.visible !== false).sort((a, b) => a.order - b.order);
  const customSections = await Promise.all(visibleSections.map((s) => resolveSection(s, products)));

  const sliderProducts = [...products].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 5);
  const deals = products.filter((p) => p.discountPrice > 0).slice(0, 8);
  const topSelling = [...products].sort((a, b) => b.numReviews - a.numReviews).slice(0, 8);
  const newArrivals = products.slice(0, 8);

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-7xl mx-auto px-4 pt-6 space-y-14 pb-14">
        <HeroSlider products={sliderProducts} customSlides={heroSlides} />

        {/* categories */}
        {categories.length > 0 && (
          <section>
            <SectionTitle title="Explore Popular Categories" href="/products" label="View All" />
            <div className="flex gap-6 overflow-x-auto pb-1.5">
              {categories.map((c) => (
                <Link key={c._id} href={`/products?category=${encodeURIComponent(c.name)}`} className="shrink-0 text-center w-28 group">
                  <div className="w-28 h-28 rounded-full overflow-hidden bg-cream-alt border border-line">
                    {c.image ? (
                      <img src={c.image} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-display font-bold text-indigo-900/40">
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <span className="block mt-2.5 text-[13.5px] font-bold text-ink">{c.name}</span>
                </Link>
              ))}
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

        {/* trust strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-line py-6">
          {perks.map((p) => (
            <div key={p.title} className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-900 flex items-center justify-center shrink-0">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
                </svg>
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-ink">{p.title}</p>
                <p className="text-[12.5px] text-ink-muted mt-0.5">{p.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {deals.length > 0 && (
          <section>
            <SectionTitle eyebrow="Limited time" title="Today's Deals" href="/products?deals=1" label="See all deals" />
            <ProductGrid products={deals} />
          </section>
        )}

        {topSelling.length > 0 && (
          <section>
            <SectionTitle eyebrow="Trending" title="Best Sellers" href="/products?sort=top" label="See all" />
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
