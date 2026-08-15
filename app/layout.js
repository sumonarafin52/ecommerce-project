// app/layout.js
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import "@/styles/globals.css";
import Providers from "@/components/Providers";
import LayoutSwitcher from "@/components/layout/LayoutSwitcher";

// Latin text uses Inter; Bangla text (header, product names, etc.) falls back
// to Noto Sans Bengali via the --font-bn CSS variable so bilingual content
// renders consistently instead of dropping to a mismatched system font.
const inter = { variable: "--font-inter", className: "" };
const notoBengali = { variable: "--font-bn" };

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

  const storeName = general.storeName || "SumonMart";
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
    icons: general.storeLogo ? { icon: general.storeLogo } : undefined,
    robots: { index: true, follow: true },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoBengali.variable} ${inter.className}`}>
        <Providers>
          <LayoutSwitcher>{children}</LayoutSwitcher>
        </Providers>
      </body>
    </html>
  );
}