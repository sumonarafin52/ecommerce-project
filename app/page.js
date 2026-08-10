// app/page.js
import Link from "next/link";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import HeroSlider from "@/components/ui/HeroSlider";
import ProductGrid from "@/components/product/ProductGrid";
import RecommendedGrid from "@/components/product/RecommendedGrid";
import { getEffectivePrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

const perks = [
  { title: "Free Home Delivery", sub: "On every order, nationwide", icon: "M3 7h11v8H3V7zm11 3h4l3 3v2h-7v-5zM7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" },
  { title: "Secure Payment", sub: "bKash, cards & SSLCommerz", icon: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" },
  { title: "Easy Returns", sub: "7-day return policy", icon: "M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-4M20 14a8 8 0 01-14 4" },
  { title: "24/7 Support", sub: "Call or email anytime", icon: "M4 12a8 8 0 0116 0v5a2 2 0 01-2 2h-2v-6h4M4 12v5a2 2 0 002 2h2v-6H4" },
];

function SectionTitle({ title, href, label }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
        <span className="w-1 h-6 bg-accent rounded-full" />
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm text-accent hover:underline">
          {label || "See all"}
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  await connectDB();
  const raw = await Product.find().sort({ createdAt: -1 }).limit(60).lean();
  const products = JSON.parse(JSON.stringify(raw));

  const sliderProducts = [...products].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 4);
  const deals = products.filter((p) => p.discountPrice > 0).slice(0, 4);
  const under100 = products.filter((p) => getEffectivePrice(p) <= 100).slice(0, 4);
  const topSelling = [...products].sort((a, b) => b.numReviews - a.numReviews).slice(0, 8);
  const newArrivals = products.slice(0, 8);
  const mustHaves = [...products].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 4);

  const cards = [
    { title: "Shop for less", link: "/products?deals=1", label: "See deals", items: deals },
    { title: "Free Home Delivery", link: "/products", label: "Shop now", items: mustHaves },
    { title: "Must haves for every day", link: "/products?sort=top", label: "Discover more", items: topSelling.slice(0, 4) },
    { title: "New arrivals under ৳100", link: "/products?max=100", label: "Shop under ৳100", items: under100 },
  ];

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
        <HeroSlider products={sliderProducts} />

        {/* perks strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {perks.map((p) => (
            <div
              key={p.title}
              className="flex items-center gap-3 bg-primary-light border border-white/10 rounded-lg px-4 py-3"
            >
              <svg className="w-6 h-6 text-accent shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
              </svg>
              <div>
                <p className="text-sm font-bold text-white">{p.title}</p>
                <p className="text-xs text-zinc-400">{p.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* amazon-style 4 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className="bg-primary-light border border-white/10 rounded-lg p-4 flex flex-col hover:border-accent/60 transition-colors"
            >
              <h3 className="font-bold text-white mb-3">{card.title}</h3>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {card.items.length > 0 ? (
                  card.items.map((p) => (
                    <Link
                      key={p._id}
                      href={`/products/${p._id}`}
                      className="aspect-square bg-black/30 rounded overflow-hidden"
                    >
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </Link>
                  ))
                ) : (
                  <div className="col-span-2 aspect-[2/1] bg-black/30 rounded flex items-center justify-center text-zinc-500 text-xs">
                    Coming soon
                  </div>
                )}
              </div>
              <Link href={card.link} className="mt-auto text-sm text-accent hover:underline">
                {card.label}
              </Link>
            </div>
          ))}
        </div>

        <RecommendedGrid />

        <section>
          <SectionTitle title="Top selling products" href="/products?sort=top" />
          <ProductGrid products={topSelling} />
        </section>

        <section>
          <SectionTitle title="New products" href="/products?sort=new" />
          <ProductGrid products={newArrivals} />
        </section>
      </div>
    </div>
  );
}