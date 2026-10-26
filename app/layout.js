// app/layout.js
import { Inter, Noto_Sans_Bengali, Fraunces, Public_Sans } from "next/font/google";
import "@/styles/globals.css";
import Providers from "@/components/Providers";
import LayoutSwitcher from "@/components/layout/LayoutSwitcher";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "700"], variable: "--font-bn", display: "swap" });
// Storefront redesign fonts (cream bazaar theme) — only used by pages
// migrated to the new design via the `font-display`/`font-body2` Tailwind
// classes; everything else keeps using Inter as before.
const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fraunces", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-publicsans", display: "swap" });

import connectDB from "@/lib/db";
import Settings from "@/models/Settings";

export async function generateMetadata() {
  // dynamic — reads Settings → General so the browser tab title, meta
  // description, and Open Graph data reflect what the admin configured
  // instead of a hardcoded fallback
  let general = {};
  try {
    await connectDB();
    const settings = await Settings.findOne().lean();
    general = settings?.general || {};
  } catch {
    // DB unreachable at build/edge time — fall back to defaults below
  }

  const storeName = general.storeName || "Online Store";
  const description =
    general.storeDescription ||
    "Best online shopping experience — bilingual (English/Bangla) storefront with fast delivery across Bangladesh.";

  return {
    metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
    title: { default: `${storeName} - Online Shopping`, template: `%s | ${storeName}` },
    description,
    openGraph: {
      title: `${storeName} - Online Shopping`,
      description,
      siteName: storeName,
      type: "website",
      images: general.storeLogo ? [{ url: general.storeLogo }] : undefined,
    },
    icons: general.storeLogo
      ? { icon: general.storeLogo, apple: "/icons/apple-touch-icon.png" }
      // name the favicon explicitly: supplying an `icons` object replaces
      // the automatic app/icon.svg, which left browser tabs with no icon
      : { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
    // iOS: full-screen when launched from the home screen
    appleWebApp: { capable: true, title: storeName, statusBarStyle: "default" },
    robots: { index: true, follow: true },
  };
}

// colours the browser/status bar on phones to match the brand
// viewportFit "cover" lets pages use the full screen on notched phones —
// without it, env(safe-area-inset-*) is always 0 and the bottom bars would
// sit under the iPhone home indicator in installed-app mode.
export const viewport = { themeColor: "#1E3A5F", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* LanguageProvider updates this after mount. Reading the cookie here
          would make EVERY page dynamic — too high a price for setting it a
          moment earlier. */}
      <body className={`${inter.variable} ${notoBengali.variable} ${fraunces.variable} ${publicSans.variable} ${inter.className}`}>
        <Providers>
          <LayoutSwitcher>{children}</LayoutSwitcher>
        </Providers>
      </body>
    </html>
  );
}