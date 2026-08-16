export default function sitemap() {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const routes = ["", "/products", "/cart", "/login", "/register"];

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
