// middleware.js
//
// Legacy product URLs: /products/<objectid> → /products/<slug>, as a real
// HTTP 308.
//
// Why here and not in the page or layout. Both of those render inside the
// Suspense boundary that app/products/loading.js creates, so by the time
// they run Next has already flushed the shell and can only turn a redirect
// into a client-side one — a 200 carrying the full page. A person's browser
// follows that, but a crawler records two URLs serving the same product,
// which is the duplicate-content split that slugs were meant to end.
// Middleware runs before any rendering, so the redirect is a status code.
//
// It costs one small internal request, and only on a URL that still uses an
// id: links shared, bookmarked or indexed before slugs existed. Everything
// else — every link the store renders today — matches nothing here and is
// passed straight through.
import { NextResponse } from "next/server";

const LEGACY_PRODUCT_URL = /^\/products\/([0-9a-fA-F]{24})$/;

export async function middleware(request) {
  const match = request.nextUrl.pathname.match(LEGACY_PRODUCT_URL);
  if (!match) return NextResponse.next();

  try {
    const res = await fetch(new URL(`/api/products/${match[1]}/canonical`, request.nextUrl.origin), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return NextResponse.next();

    const { slug } = await res.json();
    if (!slug) return NextResponse.next();

    const target = request.nextUrl.clone();
    target.pathname = `/products/${slug}`;
    // 308 rather than 302: the move is permanent, and unlike 301 it is
    // defined to preserve the method.
    return NextResponse.redirect(target, 308);
  } catch {
    // A product page must never fail to open because the redirect lookup
    // did. Serving it at the id URL is the correct fallback — the canonical
    // tag on the page still points search engines at the slug.
    return NextResponse.next();
  }
}

export const config = {
  // Narrow on purpose: middleware runs on every matched request, so it is
  // scoped to the one path shape that can need a redirect — a product
  // segment that is a 24-character hex id.
  //
  // The pattern is spelled out rather than written as "/products/:id",
  // which Next compiles to a regexp matching /products itself and not the
  // segment below it — so the redirect silently never ran.
  matcher: ["/products/:id([0-9a-fA-F]{24})"],
};
