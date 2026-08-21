// components/layout/Header.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import useCartStore, { cartKeyOf } from "@/store/cartStore";
import useWishlistStore from "@/store/wishlistStore";
import { formatCurrency, getEffectivePrice } from "@/lib/utils";

const translations = {
  en: {
    deliverTo: "Delivering to",
    updateLocation: "Update Location",
    searchPlaceholder: "Search for any product or brand",
    signIn: "Sign In",
    account: "Account",
    cart: "Cart",
    all: "All Categories",
    allProducts: "All Products",
    deals: "Best Deals",
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
    updateLocation: "লোকেশন পরিবর্তন",
    searchPlaceholder: "পণ্য বা ব্র্যান্ড খুঁজুন",
    signIn: "সাইন ইন",
    account: "অ্যাকাউন্ট",
    cart: "কার্ট",
    all: "সব ক্যাটাগরি",
    allProducts: "সব পণ্য",
    deals: "সেরা ডিল",
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
  const { data: session, status } = useSession();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const cartItems = useCartStore((s) => s.items);
  const cartTotal = useCartStore((s) => s.getTotalPrice());
  const removeCartItem = useCartStore((s) => s.removeItem);

  const [lang, setLang] = useState("en");
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState(null); // null = not fetched yet for this query
  const [recentSearches, setRecentSearches] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  // store branding — falls back to the original hardcoded name/no-logo look
  // until Settings → General is configured, so nothing changes visually
  // for stores that haven't set a custom name/logo yet
  const [brand, setBrand] = useState({ storeName: "SumonMart", storeLogo: "", headerAnnouncement: "" });

  const t = translations[lang];

  useEffect(() => {
    setLang(localStorage.getItem("sm_lang") || "en");
    try {
      setRecentSearches(JSON.parse(localStorage.getItem("sm_searches") || "[]"));
    } catch {}
    fetch("https://ipwho.is/")
      .then((r) => r.json())
      .then((d) => setCountry(d.country || "Bangladesh"))
      .catch(() => setCountry("Bangladesh"));
    fetch("/api/categories")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setCategories(res.data);
      })
      .catch(() => {});
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.general?.storeName) {
          setBrand({
            storeName: res.data.general.storeName,
            storeLogo: res.data.general.storeLogo || "",
            headerAnnouncement: res.data.general.headerAnnouncement || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status === "authenticated") useWishlistStore.getState().load();
    else if (status === "unauthenticated") useWishlistStore.getState().reset();
  }, [status]);

  const loadNotifications = () => {
    if (status !== "authenticated") return;
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setNotifications(res.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // debounced live search suggestions
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions(null);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/products/suggest?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setSuggestions(res.data);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const switchLang = (code) => {
    setLang(code);
    localStorage.setItem("sm_lang", code);
    setOpenMenu(null);
  };

  const runSearch = (term) => {
    if (!term) return;
    try {
      const prev = JSON.parse(localStorage.getItem("sm_searches") || "[]");
      const updated = [term, ...prev.filter((s) => s !== term)].slice(0, 5);
      localStorage.setItem("sm_searches", JSON.stringify(updated));
      setRecentSearches(updated);
    } catch {}
    setShowDropdown(false);
    router.push(`/products?search=${encodeURIComponent(term)}`);
  };

  const submitSearch = (e) => {
    e.preventDefault();
    runSearch(query.trim());
  };

  const toggle = (menu) => {
    setOpenMenu((m) => (m === menu ? null : menu));
    if (menu === "notifications") loadNotifications();
  };

  const markNotificationRead = async (id) => {
    setNotifications((list) => list.map((n) => (n._id === id ? { ...n, read: true } : n)));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PUT" });
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const panelCls =
    "absolute left-0 top-full mt-2 w-60 rounded-lg bg-cream-white border border-line shadow-[0_1px_2px_rgba(15,81,50,.06),0_8px_24px_rgba(15,81,50,.07)] p-2 z-50";
  const itemCls = "block px-3 py-2 text-sm text-ink-soft rounded-md hover:bg-cream-alt hover:text-indigo-900";

  return (
    <div className="font-body2">
      {openMenu && <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />}

      {brand.headerAnnouncement && (
        <div className="bg-gold text-indigo-950 text-center text-xs font-bold py-2 px-4">
          {brand.headerAnnouncement}
        </div>
      )}

      {/* Row 1 — logo, search, delivery, language, cart, account */}
      <header className="bg-cream-white border-b border-line">
        <div className="max-w-7xl mx-auto px-4 relative z-50 flex items-center gap-5 h-[78px]">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-2xl text-indigo-900 shrink-0">
            {brand.storeLogo ? (
              <img src={brand.storeLogo} alt={brand.storeName} className="h-9 w-auto object-contain" />
            ) : (
              <>
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-900 to-indigo-700 text-gold flex items-center justify-center text-base font-bold shrink-0">
                  {brand.storeName.charAt(0)}
                </span>
                {brand.storeName}
              </>
            )}
          </Link>

          <div className="flex-1 hidden sm:block relative max-w-2xl">
            <form
              onSubmit={submitSearch}
              className="flex h-[46px] border-2 border-indigo-900 rounded-full overflow-hidden bg-cream-white focus-within:shadow-[0_0_0_3px_rgba(44,82,130,0.12)] transition-shadow"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder={t.searchPlaceholder}
                autoComplete="off"
                className="flex-1 min-w-0 px-4 text-sm text-ink outline-none bg-transparent placeholder-ink-muted"
              />
              <button type="submit" className="w-14 bg-indigo-900 hover:bg-indigo-950 text-white flex items-center justify-center shrink-0 transition-colors" aria-label="Search">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
                </svg>
              </button>
            </form>

            {showDropdown && (query.trim().length >= 2 ? suggestions : recentSearches.length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-cream-white text-ink rounded-lg shadow-[0_1px_2px_rgba(15,81,50,.06),0_8px_24px_rgba(15,81,50,.07)] border border-line overflow-hidden z-50 max-h-96 overflow-y-auto">
                {query.trim().length < 2 && recentSearches.length > 0 && (
                  <div className="p-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted px-2 pt-1">Recent searches</p>
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onMouseDown={() => runSearch(term)}
                        className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-cream-alt flex items-center gap-2"
                      >
                        <span className="text-ink-muted">🕘</span> {term}
                      </button>
                    ))}
                  </div>
                )}

                {query.trim().length >= 2 && suggestions && (
                  <div className="p-2">
                    {suggestions.categories?.length > 0 && (
                      <div className="mb-1">
                        {suggestions.categories.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onMouseDown={() => {
                              setShowDropdown(false);
                              router.push(`/products?category=${encodeURIComponent(c)}`);
                            }}
                            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-cream-alt flex items-center gap-2"
                          >
                            <span className="text-ink-muted">📁</span> in <span className="font-bold">{c}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestions.products?.length > 0 ? (
                      suggestions.products.map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          onMouseDown={() => {
                            setShowDropdown(false);
                            router.push(`/products/${p._id}`);
                          }}
                          className="w-full text-left px-2 py-2 text-sm rounded hover:bg-cream-alt flex items-center gap-3"
                        >
                          {p.images?.[0] && <img src={p.images[0]} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-xs font-bold text-ink-muted shrink-0">{formatCurrency(getEffectivePrice(p))}</span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-ink-muted px-2 py-2">No matches — press Enter to search anyway</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="hidden lg:flex items-center gap-2 text-ink-soft shrink-0">
            <svg className="w-[18px] h-[18px] text-indigo-900" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 019.9 0c2.73 2.74 2.73 7.17 0 9.9L10 18.9l-4.95-4.95c-2.73-2.73-2.73-7.16 0-9.9zM10 12a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="text-left leading-tight">
              <span className="block text-[11px]">{t.deliverTo} {country || "Bangladesh"}</span>
              <span className="block text-[13px] font-bold text-ink">{t.updateLocation}</span>
            </span>
          </button>

          <div className="relative shrink-0">
            <button onClick={() => toggle("lang")} className="flex items-center gap-1.5 text-sm font-bold text-ink border border-line rounded-lg px-3 py-2 hover:border-indigo-700">
              {lang === "en" ? "EN" : "বাং"}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openMenu === "lang" && (
              <div className={panelCls + " w-32"}>
                <button onClick={() => switchLang("en")} className={itemCls}>English</button>
                <button onClick={() => switchLang("bn")} className={itemCls}>বাংলা</button>
              </div>
            )}
          </div>

          {session && (
            <div className="relative shrink-0">
              <button onClick={() => toggle("notifications")} className="relative flex items-center text-ink" aria-label="Notifications">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-brick text-white text-[9.5px] font-extrabold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {openMenu === "notifications" && (
                <div className={panelCls + " w-80 max-h-96 overflow-y-auto right-0 left-auto"}>
                  <div className="flex items-center justify-between px-2 pt-1 pb-2">
                    <span className="text-xs font-bold text-ink-soft uppercase tracking-wide">Notifications</span>
                    <Link href="/profile?tab=notifications" onClick={() => setOpenMenu(null)} className="text-[11px] font-bold text-indigo-900 hover:underline">
                      View all
                    </Link>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-ink-muted px-2 py-4 text-center">No notifications yet.</p>
                  ) : (
                    notifications.slice(0, 6).map((n) => (
                      <Link
                        key={n._id}
                        href={n.link || "/profile"}
                        onClick={() => {
                          markNotificationRead(n._id);
                          setOpenMenu(null);
                        }}
                        className={`block px-3 py-2 rounded-md text-left ${n.read ? "hover:bg-cream-alt" : "bg-indigo-100/50 hover:bg-indigo-100"}`}
                      >
                        <p className="text-xs font-bold text-ink">{n.title}</p>
                        <p className="text-[11px] text-ink-soft mt-0.5 line-clamp-2">{n.message}</p>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div
            className="relative shrink-0"
            onMouseEnter={() => setOpenMenu("cart")}
            onMouseLeave={() => setOpenMenu((m) => (m === "cart" ? null : m))}
          >
            <Link href="/cart" className="relative flex items-center gap-2 text-ink font-bold text-sm">
              <span className="relative">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-indigo-950 text-[10.5px] font-extrabold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </span>
              <span className="hidden md:block">{t.cart}</span>
            </Link>

            {openMenu === "cart" && (
              <div className={panelCls + " w-80 right-0 left-auto"}>
                {cartItems.length === 0 ? (
                  <p className="text-xs text-ink-muted px-2 py-4 text-center">Your cart is empty.</p>
                ) : (
                  <>
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {cartItems.slice(0, 5).map((item) => (
                        <div key={cartKeyOf(item)} className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-cream-alt">
                          <div className="w-10 h-10 rounded-md bg-cream-alt overflow-hidden shrink-0">
                            {item.images?.[0] && <img src={item.images[0]} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-ink line-clamp-1">{item.name}</p>
                            <p className="text-[11px] text-ink-muted">
                              {item.quantity} × {formatCurrency(getEffectivePrice(item))}
                            </p>
                          </div>
                          <button
                            onClick={() => removeCartItem(cartKeyOf(item))}
                            className="text-ink-muted hover:text-brick text-xs shrink-0"
                            aria-label="Remove from cart"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {cartItems.length > 5 && (
                        <p className="text-[11px] text-ink-muted text-center pt-1">+ {cartItems.length - 5} more item(s)</p>
                      )}
                    </div>
                    <div className="border-t border-line mt-2 pt-2.5 px-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-ink-soft">Subtotal</span>
                      <span className="text-sm font-bold text-indigo-900">{formatCurrency(cartTotal)}</span>
                    </div>
                    <div className="px-2 pt-2 grid grid-cols-2 gap-2">
                      <Link
                        href="/cart"
                        onClick={() => setOpenMenu(null)}
                        className="text-center border border-line hover:border-indigo-700 text-ink-soft font-bold text-xs py-2 rounded-lg transition-colors"
                      >
                        View Cart
                      </Link>
                      <Link
                        href="/checkout"
                        onClick={() => setOpenMenu(null)}
                        className="text-center bg-gold hover:bg-gold-dark text-indigo-950 font-bold text-xs py-2 rounded-lg transition-colors"
                      >
                        Checkout
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div
            className="relative shrink-0"
            onMouseEnter={() => setOpenMenu("account")}
            onMouseLeave={() => setOpenMenu((m) => (m === "account" ? null : m))}
          >
            <button
              onClick={() => router.push(session ? "/profile" : "/login")}
              className="flex items-center gap-2 text-ink font-bold text-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden md:block">{session ? session.user?.name?.split(" ")[0] : t.signIn}</span>
            </button>
            {openMenu === "account" && (
              <div className={panelCls}>
                <div className="h-1 rounded-t bg-gradient-to-r from-gold to-transparent -m-2 mb-2" />
                {session ? (
                  <>
                    <Link href="/profile" className={itemCls} onClick={() => setOpenMenu(null)}>{t.profile}</Link>
                    <Link href="/profile" className={itemCls} onClick={() => setOpenMenu(null)}>{t.orders}</Link>
                    {session.user?.role === "admin" && (
                      <Link href="/admin" className={itemCls} onClick={() => setOpenMenu(null)}>{t.admin}</Link>
                    )}
                    <button onClick={() => { setOpenMenu(null); signOut(); }} className={itemCls + " text-brick"}>
                      {t.logout}
                    </button>
                  </>
                ) : (
                  <div className="p-2 space-y-2">
                    <Link href="/login" className="block text-center bg-gold hover:bg-gold-dark text-indigo-950 font-bold rounded-lg py-2.5 text-sm transition-colors">
                      {t.login}
                    </Link>
                    <Link href="/register" className="block text-center border border-line hover:border-indigo-700 rounded-lg py-2.5 text-sm font-semibold text-ink">
                      {t.signup}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2 — category nav */}
        <nav className="bg-cream-white border-t border-line">
          <div className="max-w-7xl mx-auto px-4 relative z-40 flex items-center gap-6 h-[52px] overflow-x-auto whitespace-nowrap text-[13.5px]">
            <div className="relative shrink-0">
              <button onClick={() => toggle("categories")} className="flex items-center gap-2 font-bold text-ink hover:text-indigo-900">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {t.all}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openMenu === "categories" && (
                <div className={panelCls}>
                  <Link href="/products" className={itemCls + " font-bold text-indigo-900"} onClick={() => setOpenMenu(null)}>
                    {t.allProducts}
                  </Link>
                  {categories.map((c) => (
                    <Link key={c._id} href={`/products?category=${encodeURIComponent(c.name)}`} className={itemCls} onClick={() => setOpenMenu(null)}>
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {categories.slice(0, 6).map((c) => (
              <Link key={c._id} href={`/products?category=${encodeURIComponent(c.name)}`} className="text-ink-soft hover:text-indigo-900 shrink-0">
                {c.name}
              </Link>
            ))}

            <div className="flex-1" />

            <Link href="/products?deals=1" className="flex items-center gap-1.5 font-bold text-gold-dark shrink-0">
              🏷️ {t.deals}
            </Link>
            <div className="relative shrink-0">
              <button onClick={() => toggle("service")} className="text-ink-soft hover:text-indigo-900 font-semibold">
                {t.customerService}
              </button>
              {openMenu === "service" && (
                <div className={panelCls + " right-0 left-auto"}>
                  <a href="mailto:support@sumonmart.com" className={itemCls}>{t.helpEmail}</a>
                  <a href="tel:+8801700000000" className={itemCls}>{t.helpCall}</a>
                  <Link href="/track" className={itemCls} onClick={() => setOpenMenu(null)}>{t.orderStatus}</Link>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>
    </div>
  );
}
