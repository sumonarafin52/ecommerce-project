// components/layout/Footer.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const linkCls = "block text-[13px] text-cream-bg/70 hover:text-gold transition-colors py-1.5";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  // falls back to the original hardcoded copy until Settings → General is
  // configured, so nothing changes visually for stores that haven't set
  // custom footer text yet
  const [brand, setBrand] = useState({
    storeName: "SumonMart",
    storeLogo: "",
    footerAbout: "SumonMart is Bangladesh's marketplace for local sellers — everyday goods, fast delivery, secure checkout.",
    footerCopyright: "© 2026 SumonMart — Made in Bangladesh",
    socialLinks: {},
  });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.general) {
          const g = res.data.general;
          setBrand((b) => ({
            storeName: g.storeName || b.storeName,
            storeLogo: g.storeLogo || "",
            footerAbout: g.footerAbout || b.footerAbout,
            footerCopyright: g.footerCopyright || b.footerCopyright,
            socialLinks: g.socialLinks || {},
          }));
        }
      })
      .catch(() => {});
  }, []);

  const subscribe = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail("");
  };

  const socials = [
    ["facebook", "Facebook"],
    ["instagram", "Instagram"],
    ["youtube", "YouTube"],
    ["whatsapp", "WhatsApp"],
  ].filter(([key]) => brand.socialLinks?.[key]);

  return (
    <footer className="font-body2">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="w-full bg-cream-alt hover:bg-line text-ink-soft text-sm font-semibold py-3 transition-colors"
      >
        Back to top
      </button>

      {/* newsletter band */}
      <div className="bg-indigo-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-11 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-display text-2xl font-semibold">Get deals before everyone else</h3>
            <p className="text-cream-bg/70 text-sm mt-1.5">Weekly picks and flash-sale alerts, straight to your inbox.</p>
          </div>
          {subscribed ? (
            <p className="text-gold font-bold text-sm">Thanks for subscribing! 🎉</p>
          ) : (
            <form onSubmit={subscribe} className="flex gap-2.5 w-full sm:w-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 sm:w-72 px-4 py-3 rounded-lg border-none text-sm text-ink outline-none"
              />
              <button className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg text-sm transition-colors shrink-0">
                Subscribe
              </button>
            </form>
          )}
        </div>
      </div>

      {/* main footer */}
      <div className="bg-indigo-950 text-cream-bg/80 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-11 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-display font-bold text-xl text-white">
              {brand.storeLogo ? (
                <img src={brand.storeLogo} alt={brand.storeName} className="h-8 w-auto object-contain" />
              ) : (
                <>
                  <span className="w-7 h-7 rounded-lg bg-gold text-indigo-950 flex items-center justify-center text-sm font-extrabold shrink-0">
                    {brand.storeName.charAt(0)}
                  </span>
                  {brand.storeName}
                </>
              )}
            </Link>
            {brand.footerAbout && (
              <p className="mt-3.5 text-[13px] leading-relaxed text-cream-bg/60">{brand.footerAbout}</p>
            )}
          </div>

          <div>
            <h4 className="text-white text-[13.5px] font-bold mb-3.5">Shop</h4>
            <Link href="/products" className={linkCls}>All Products</Link>
            <Link href="/products?deals=1" className={linkCls}>Today's Deals</Link>
            <Link href="/products?sort=top" className={linkCls}>Best Sellers</Link>
            <Link href="/products?sort=new" className={linkCls}>New Arrivals</Link>
          </div>

          <div>
            <h4 className="text-white text-[13.5px] font-bold mb-3.5">Account</h4>
            <Link href="/profile" className={linkCls}>Profile</Link>
            <Link href="/track" className={linkCls}>Order Status</Link>
            <Link href="/cart" className={linkCls}>Cart</Link>
            <Link href="/login" className={linkCls}>Sign in</Link>
          </div>

          <div>
            <h4 className="text-white text-[13.5px] font-bold mb-3.5">Support</h4>
            <Link href="/track" className={linkCls}>Track Order</Link>
            <a href="mailto:support@sumonmart.com" className={linkCls}>support@sumonmart.com</a>
            <a href="tel:+8801700000000" className={linkCls}>+880 1700-000000</a>
          </div>

          <div>
            <h4 className="text-white text-[13.5px] font-bold mb-3.5">Payments</h4>
            <p className="text-[13px] py-1.5">bKash · Nagad</p>
            <p className="text-[13px] py-1.5">VISA · Mastercard</p>
            <p className="text-[13px] py-1.5">SSLCommerz</p>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-cream-bg/60">{brand.footerCopyright}</p>
            {socials.length > 0 && (
              <div className="flex items-center gap-4">
                {socials.map(([key, label]) => (
                  <a key={key} href={brand.socialLinks[key]} target="_blank" rel="noopener noreferrer" className="text-cream-bg/60 hover:text-gold text-xs font-bold">
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
