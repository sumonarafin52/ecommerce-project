// components/layout/LayoutSwitcher.jsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminTopHeader from "@/components/layout/AdminTopHeader";
import AdminFooter from "@/components/layout/AdminFooter";
import CompareBar from "@/components/product/CompareBar";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import BottomTabBar, { showsTabBar } from "@/components/layout/BottomTabBar";

export default function LayoutSwitcher({ children }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  // login/register use a full-bleed split-screen layout with no site
  // chrome (matches the auth page reference design) — same pattern as the
  // admin check above, just for a different pair of routes
  const isAuth = ["/login", "/register", "/forgot-password", "/reset-password"].includes(pathname);

  useEffect(() => {
    if (isAdmin) document.body.classList.add("admin-theme");
    else document.body.classList.remove("admin-theme");
    return () => document.body.classList.remove("admin-theme");
  }, [isAdmin]);

  if (isAdmin) {
    return (
      <>
        <AdminTopHeader />
        <main className="min-h-[calc(100vh-3.5rem-3.5rem)]">{children}</main>
        <AdminFooter />
      </>
    );
  }

  if (isAuth) {
    return <main>{children}</main>;
  }

  return (
    <>
      <Header />
      <main className="min-h-screen">{children}</main>
      <CompareBar />
      <WhatsAppButton />
      <Footer />
      <BottomTabBar />
      {/* reserve the tab bar's height so the end of the page isn't hidden under it */}
      {showsTabBar(pathname) && <div className="md:hidden h-[calc(60px+env(safe-area-inset-bottom))]" aria-hidden="true" />}
    </>
  );
}