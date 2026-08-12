// app/layout.js
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import Providers from "@/components/Providers";
import LayoutSwitcher from "@/components/layout/LayoutSwitcher";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "SumonShop - Online Shopping",
  description: "Best online shopping experience",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <LayoutSwitcher>{children}</LayoutSwitcher>
        </Providers>
      </body>
    </html>
  );
}