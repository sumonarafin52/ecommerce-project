export default function robots() {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/checkout", "/profile"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
