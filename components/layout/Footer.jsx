// components/layout/Footer.jsx
"use client";

import { useState } from "react";
import Link from "next/link";

const linkCls = "block text-sm text-zinc-400 hover:text-accent transition-colors py-1";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail("");
  };

  return (
    <footer className="mt-12">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="w-full bg-primary-light hover:bg-white/10 text-zinc-200 text-sm font-medium py-3 transition-colors"
      >
        Back to top
      </button>

      <div className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold mb-3">Shop</h3>
            <Link href="/products" className={linkCls}>All Products</Link>
            <Link href="/products?deals=1" className={linkCls}>Today's Deals</Link>
            <Link href="/products?sort=top" className={linkCls}>Best Sellers</Link>
            <Link href="/products?sort=new" className={linkCls}>New Arrivals</Link>
          </div>

          <div>
            <h3 className="font-bold mb-3">Your Account</h3>
            <Link href="/profile" className={linkCls}>Profile</Link>
            <Link href="/profile" className={linkCls}>Order Status</Link>
            <Link href="/cart" className={linkCls}>Cart</Link>
            <Link href="/login" className={linkCls}>Sign in</Link>
          </div>

          <div>
            <h3 className="font-bold mb-3">Customer Service</h3>
            <a href="mailto:support@sumonmart.com" className={linkCls}>support@sumonmart.com</a>
            <a href="tel:+8801700000000" className={linkCls}>+880 1700-000000</a>
            <p className={linkCls}>Sat–Thu, 9am–9pm</p>
          </div>

          <div>
            <h3 className="font-bold mb-3">Stay Updated</h3>
            <p className="text-sm text-zinc-400 mb-3">Get deals & new arrivals in your inbox.</p>
            {subscribed ? (
              <p className="text-sm text-accent font-medium">Thanks for subscribing! 🎉</p>
            ) : (
              <form onSubmit={subscribe} className="flex rounded-md overflow-hidden">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  className="flex-1 min-w-0 px-3 py-2 text-sm text-zinc-900 bg-white outline-none"
                />
                <button className="bg-accent hover:bg-accent/80 text-primary font-bold px-4 text-sm">
                  Join
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/" className="text-lg font-extrabold">
              sumon<span className="text-accent">mart</span>
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-zinc-300">
              {["bKash", "Nagad", "VISA", "Mastercard", "SSLCommerz"].map((p) => (
                <span key={p} className="px-2 py-1 rounded bg-primary-light border border-white/10">
                  {p}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-500">© 2026 Sumon Mart — Made in Bangladesh</p>
          </div>
        </div>
      </div>
    </footer>
  );
}