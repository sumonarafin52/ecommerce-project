// lib/productSignals.js
"use client";

// Telling the shop that a product was looked at, or put in a basket.
//
// Two rules, both about not lying to the shop owner:
//
//   A view counts once per product per browsing session. Without that,
//   "views" would really mean "page loads", and a shopper comparing two
//   sizes by flipping back and forth would look like a crowd.
//
//   An add-to-cart counts once per product per few seconds. Adding three
//   of something calls the cart store three times, and a double-click
//   calls it twice; neither is three or two people wanting it.
//
// Every call is fire-and-forget. A counter must never delay a page, block
// a button, or surface an error to a shopper — if the request fails, the
// number is simply not recorded.

const VIEW_KEY = "sm_viewed_signals";
const CART_WINDOW_MS = 5000;

const recentCartAdds = new Map();

/** Session-scoped so the count resets when they come back tomorrow. */
function alreadyViewed(productId) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "[]");
    if (seen.includes(productId)) return true;
    sessionStorage.setItem(VIEW_KEY, JSON.stringify([...seen, productId].slice(-100)));
    return false;
  } catch {
    // Private browsing, blocked storage, a quota error — count it rather
    // than losing the signal entirely. Over-counting a little beats a
    // silent zero.
    return false;
  }
}

function send(productId, type) {
  try {
    fetch(`/api/products/${encodeURIComponent(productId)}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
      // The page may be unloading as this fires (a shopper clicking straight
      // through); keepalive lets the browser finish sending it anyway.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let a counter break a page.
  }
}

/** Call when a product page is opened. */
export function recordView(productId) {
  if (!productId || alreadyViewed(String(productId))) return;
  send(productId, "view");
}

/** Call when a product reaches the basket. */
export function recordAddToCart(productId) {
  if (!productId) return;
  const id = String(productId);
  const last = recentCartAdds.get(id) || 0;
  if (Date.now() - last < CART_WINDOW_MS) return;
  recentCartAdds.set(id, Date.now());
  send(id, "cart");
}
