// app/admin/products/new/page.js
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";
import ProductForm from "@/components/admin/ProductForm";

export default function NewProductPage() {
  const { data: session, status } = useSession();
  const { can, loading } = usePermissions();

  if (status === "loading" || loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !can("products")) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access denied</p>
        <Link href="/" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <Link href="/admin/products" className="text-xs text-zinc-400 hover:text-accent transition-colors">
            ← Products
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">Add Product</h1>
          <p className="text-xs text-zinc-500 mt-1">Shopify-style dedicated creation page — no popups.</p>
        </div>
        <ProductForm />
      </div>
    </div>
  );
}