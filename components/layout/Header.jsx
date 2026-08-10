// components/layout/Header.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import useCartStore from "@/store/cartStore";

const translations = {
  en: {
    deliverTo: "Deliver to",
    searchPlaceholder: "Search Sumon Mart...",
    hello: "Hello, Sign in",
    account: "Account",
    cart: "Cart",
    all: "All",
    allProducts: "All Products",
    deals: "Today's Deals",
    bestSellers: "Best Sellers",
    newArrivals: "New Arrivals",
    orderStatus: "Order Status",
    customerService: "Customer Service",
    login: "Sign in",
    signup: "Create account",
    logout: "Sign out",
    profile: "Your Profile",
    orders: "Your Orders",
    admin: "Admin Panel",
    helpEmail: "Email Support",
    helpCall: "Call Us",
  },
  bn: {
    deliverTo: "ডেলিভারি",
    searchPlaceholder: "সুমোন মার্ট-এ খুঁজুন...",
    hello: "হ্যালো, সাইন ইন",
    account: "অ্যাকাউন্ট",
    cart: "কার্ট",
    all: "সব",
    allProducts: "সব পণ্য",
    deals: "আজকের ডিল",
    bestSellers: "বেস্ট সেলার",
    newArrivals: "নতুন পণ্য",
    orderStatus: "অর্ডার স্ট্যাটাস",
    customerService: "কাস্টমার সার্ভিস",
    login: "সাইন ইন",
    signup: "অ্যাকাউন্ট খুলুন",
    logout: "লগ আউট",
    profile: "আপনার প্রোফাইল",
    orders: "আপনার অর্ডার",
    admin: "অ্যাডমিন প্যানেল",
    helpEmail: "ইমেইল সাপোর্ট",
    helpCall: "কল করুন",
  },
};

export default function Header() {
  const router = useRouter();
  const { data: session } = useSession();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  const [lang, setLang] = useState("en");
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [openMenu, setOpenMenu] = useState(null);
  const [categories, setCategories] = useState([]);

  const t = translations[lang];

  useEffect(() => {
    setLang(localStorage.getItem("sm_lang") || "en");
    // detect visitor's country for the delivery label
    fetch("https://ipwho.is/")
      .then((r) => r.json())
      .then((d) => setCountry(d.country || "Bangladesh"))
      .catch(() => setCountry("Bangladesh"));
    fetch("/api/products?limit=100")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setCategories([...new Set(res.data.products.map((p) => p.category))]);
      })
      .catch(() => {});
  }, []);

  const switchLang = (code) => {
    setLang(code);
    localStorage.setItem("sm_lang", code);
    setOpenMenu(null);
  };

  const submitSearch = (e) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    // remember searches for the "Your choice products" section
    try {
      const prev = JSON.parse(localStorage.getItem("sm_searches") || "[]");
      localStorage.setItem(
        "sm_searches",
        JSON.stringify([term, ...prev.filter((s) => s !== term)].slice(0, 5))
      );
    } catch {}
    router.push(`/products?search=${encodeURIComponent(term)}`);
  };

  const toggle = (menu) => setOpenMenu((m) => (m === menu ? null : menu));

  const panelCls =
    "absolute left-0 top-full mt-2 w-60 rounded-md bg-primary-light border border-white/10 shadow-card p-2 z-50 animate-fade-in";
  const itemCls =
    "block px-3 py-2 text-sm text-zinc-200 rounded hover:bg-white/5 hover:text-accent";

  return (
    <header className="bg-primary text-white sticky top-0 z-50 shadow-card">
      {openMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
      )}

      <div className="max-w-7xl mx-auto px-4">
        {/* Row 1: logo, delivery, search, language, account, cart */}
        <div className="relative z-50 flex items-center gap-3 sm:gap-4 py-3">
          <Link href="/" className="text-xl font-extrabold tracking-tight whitespace-nowrap">
            sumon<span className="text-accent">mart</span>
          </Link>

          <button className="hidden lg:flex flex-col text-xs leading-tight p-1 rounded border border-transparent hover:border-white/40">
            <span className="text-zinc-400">{t.deliverTo}</span>
            <span className="font-bold flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 019.9 0c2.73 2.74 2.73 7.17 0 9.9L10 18.9l-4.95-4.95c-2.73-2.73-2.73-7.16 0-9.9zM10 12a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
              {country || "—"}
            </span>
          </button>

          <form onSubmit={submitSearch} className="flex-1 flex rounded-md overflow-hidden focus-within:shadow-glow">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="flex-1 min-w-0 px-3 py-2 text-sm text-zinc-900 bg-white outline-none"
            />
            <button type="submit" className="bg-accent hover:bg-accent/80 px-3 sm:px-4" aria-label="Search">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
            </button>
          </form>

          <div className="relative">
            <button
              onClick={() => toggle("lang")}
              className="flex items-center gap-1 text-xs font-bold p-1 rounded border border-transparent hover:border-white/40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2.4 4-5.6 4-9s-1.5-6.6-4-9c-2.5 2.4-4 5.6-4 9s1.5 6.6 4 9zM3 12h18"
                />
              </svg>
              {lang === "en" ? "EN" : "বাং"}
            </button>
            {openMenu === "lang" && (
              <div className={panelCls + " w-32"}>
                <button onClick={() => switchLang("en")} className={itemCls}>
                  English
                </button>
                <button onClick={() => switchLang("bn")} className={itemCls}>
                  বাংলা
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => toggle("account")}
              className="flex flex-col text-xs leading-tight p-1 rounded border border-transparent hover:border-accent hover:shadow-glow"
            >
              <span className="text-zinc-300 max-w-[110px] truncate">
                {session ? `Hi, ${session.user?.name?.split(" ")[0]}` : t.hello}
              </span>
              <span className="font-bold">{t.account}</span>
            </button>
            {openMenu === "account" && (
              <div className={panelCls}>
                <div className="h-1 rounded-t bg-gradient-to-r from-accent to-transparent -m-2 mb-2" />
                {session ? (
                  <>
                    <Link href="/profile" className={itemCls} onClick={() => setOpenMenu(null)}>
                      {t.profile}
                    </Link>
                    <Link href="/profile" className={itemCls} onClick={() => setOpenMenu(null)}>
                      {t.orders}
                    </Link>
                    {session.user?.role === "admin" && (
                      <Link href="/admin" className={itemCls} onClick={() => setOpenMenu(null)}>
                        {t.admin}
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        signOut();
                      }}
                      className={itemCls + " text-red-400"}
                    >
                      {t.logout}
                    </button>
                  </>
                ) : (
                  <div className="p-2 space-y-2">
                    <Link
                      href="/login"
                      className="block text-center bg-accent hover:bg-accent/80 text-primary font-bold rounded-md py-2 text-sm"
                    >
                      {t.login}
                    </Link>
                    <Link
                      href="/register"
                      className="block text-center border border-white/20 hover:border-accent hover:text-accent rounded-md py-2 text-sm"
                    >
                      {t.signup}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <Link
  href="/cart"
  className="relative flex items-end gap-1 p-1 rounded border border-transparent hover:border-white/40"
>
  <div className="relative">
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
      />
    </svg>
    {cartCount > 0 && (
      <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-primary text-[11px] font-bold flex items-center justify-center shadow-glow">
        {cartCount}
      </span>
    )}
  </div>
  <span className="hidden sm:block text-xs font-bold pb-0.5">{t.cart}</span>
</Link>
        </div>

        {/* Row 2: category nav bar */}
        <nav className="relative z-50 flex items-center gap-4 text-[13px] sm:text-sm pb-2 overflow-x-auto whitespace-nowrap">
          <div className="relative">
            <button onClick={() => toggle("categories")} className="flex items-center gap-1 font-bold hover:text-accent">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {t.all}
            </button>
            {openMenu === "categories" && (
              <div className={panelCls}>
                <Link href="/products" className={itemCls + " font-bold text-accent"} onClick={() => setOpenMenu(null)}>
                  {t.allProducts}
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c}
                    href={`/products?category=${encodeURIComponent(c)}`}
                    className={itemCls}
                    onClick={() => setOpenMenu(null)}
                  >
                    {c}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/products?deals=1" className="font-medium text-accent hover:underline">
            {t.deals}
          </Link>
          <Link href="/products?sort=top" className="hover:text-accent">
            {t.bestSellers}
          </Link>
          <Link href="/products?sort=new" className="hover:text-accent">
            {t.newArrivals}
          </Link>
          <Link href="/profile" className="hover:text-accent">
            {t.orderStatus}
          </Link>

          <div className="relative">
            <button onClick={() => toggle("service")} className="hover:text-accent">
              {t.customerService}
            </button>
            {openMenu === "service" && (
              <div className={panelCls}>
                <a href="mailto:support@sumonmart.com" className={itemCls}>
                  {t.helpEmail}
                </a>
                <a href="tel:+8801700000000" className={itemCls}>
                  {t.helpCall}
                </a>
                <Link href="/profile" className={itemCls} onClick={() => setOpenMenu(null)}>
                  {t.orderStatus}
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}