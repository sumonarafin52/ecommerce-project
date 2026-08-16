// components/layout/LayoutSwitcher.jsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminTopHeader from "@/components/layout/AdminTopHeader";
import AdminFooter from "@/components/layout/AdminFooter";

export default function LayoutSwitcher({ children }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  // login/register use a full-bleed split-screen layout with no site
  // chrome (matches the auth page reference design) — same pattern as the
  // admin check above, just for a different pair of routes
  const isAuth = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (isAdmin) document.body.classList.add("admin-theme");
    else document.body.classList.remove("admin-theme");
    return () => document.body.classList.remove("admin-theme");
  }, [isAdmin]);

  if (isAdmin) {
    return (
      <>
        <AdminTopHeader />
        <main className="min-h-[calc(100vh-4rem-3.5rem)]">{children}</main>
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
      <Footer />
    </>
  );
}