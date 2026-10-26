export default function robots() {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // private, per-user or no-value pages
        disallow: ["/admin", "/api", "/checkout", "/profile", "/cart", "/wishlist", "/compare", "/unsubscribe", "/reset-password"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
