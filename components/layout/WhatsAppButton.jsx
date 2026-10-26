// components/layout/WhatsAppButton.jsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import useStoreSettings from "@/lib/useStoreSettings";
import useCompareStore from "@/store/compareStore";

// wa.me needs the full international number, digits only. Shop owners in
// Bangladesh usually type the local form (01711…), so convert that.
export function toWhatsAppNumber(raw = "") {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); // 00880… → 880…
  if (d.length === 11 && d.startsWith("01")) d = "88" + d; // 01711… → 8801711…
  return d.length >= 10 && d.length <= 15 ? d : "";
}

export default function WhatsAppButton() {
  const settings = useStoreSettings();
  const pathname = usePathname();
  const compareCount = useCompareStore((s) => s.ids.length);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const number = toWhatsAppNumber(settings?.general?.whatsappNumber);
  if (!number) return null; // admin hasn't set one — show nothing

  const storeName = settings?.general?.storeName || "your store";
  const onProduct = pathname.startsWith("/products/");
  const message = onProduct
    ? `Hi ${storeName}, I have a question about this product: ${typeof window !== "undefined" ? window.location.href : ""}`
    : `Hi ${storeName}, I have a question.`;

  // stay clear of other bottom bars: the phone buy bar on product pages,
  // and the floating compare bar when it's showing
  // Phones: clear the product buy bar, or the tab bar (+ the compare bar when
  // it's up). Desktop has neither bar.
  const lifted = onProduct
    ? "bottom-[calc(96px+env(safe-area-inset-bottom))] md:bottom-6"
    : pathname === "/cart" // tab bar + the cart's checkout bar
    ? "bottom-[calc(140px+env(safe-area-inset-bottom))] md:bottom-6"
    : hydrated && compareCount > 0
    ? "bottom-[calc(136px+env(safe-area-inset-bottom))] md:bottom-20"
    : "bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6";

  return (
    <a
      href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`group fixed right-4 sm:right-6 ${lifted} z-40 flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(37,211,102,0.45)] pl-3.5 pr-3.5 sm:pr-4 py-3 transition-all duration-300 hover:scale-105 hover:shadow-[0_10px_28px_rgba(37,211,102,0.55)]`}
    >
      <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1112 21.8zM20.5 3.5A11.8 11.8 0 002.1 17.7L.5 23.5l6-1.6A11.8 11.8 0 0023.8 12c0-3.2-1.2-6.1-3.3-8.5z" />
      </svg>
      <span className="hidden sm:inline text-sm font-bold whitespace-nowrap">Chat with us</span>
    </a>
  );
}
