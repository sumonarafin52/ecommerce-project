// app/layout.js
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import "@/styles/globals.css";
import Providers from "@/components/Providers";
import LayoutSwitcher from "@/components/layout/LayoutSwitcher";

// Latin text uses Inter; Bangla text (header, product names, etc.) falls back
// to Noto Sans Bengali via the --font-bn CSS variable so bilingual content
// renders consistently instead of dropping to a mismatched system font.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bn",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: {
    default: "SumonShop - Online Shopping",
    template: "%s | SumonShop",
  },
  description: "Best online shopping experience — bilingual (English/Bangla) storefront with fast delivery across Bangladesh.",
  openGraph: {
    title: "SumonShop - Online Shopping",
    description: "Best online shopping experience — bilingual (English/Bangla) storefront with fast delivery across Bangladesh.",
    siteName: "SumonShop",
    type: "website",
  },
  robots: { index: true, follow: true },
};

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