// app/manifest.js
//
// Makes the store installable: "Add to Home Screen" on Android/iOS (and
// "Install app" in desktop Chrome/Edge) puts a real app icon on the device
// that opens full-screen, without the browser's address bar.
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";

export const dynamic = "force-dynamic";

export default async function manifest() {
  let name = "Online Store";
  let description = "Shop online — delivered across Bangladesh.";
  try {
    await connectDB();
    const s = await Settings.findOne().select("general.storeName general.storeDescription").lean();
    if (s?.general?.storeName) name = s.general.storeName;
    if (s?.general?.storeDescription) description = s.general.storeDescription.slice(0, 200);
  } catch {
    // fall back to defaults — the manifest must never fail to load
  }

  return {
    name,
    short_name: name.slice(0, 12),
    description,
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBF5E9",
    theme_color: "#1E3A5F",
    categories: ["shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search products", url: "/products", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My orders", url: "/profile", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Cart", url: "/cart", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
