// app/admin/products/new/page.js
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";
import ProductForm from "@/components/admin/ProductForm";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";

export default function NewProductPage() {
  const { data: session, status } = useSession();
  const { can, loading, failed: permFailed, refresh: refreshPermissions } = usePermissions();

  if (status === "loading" || loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || permLoading || permFailed || !can("products")) {
    return (
      <PermissionGate
        perm="products"
        what="products"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        <div>
          <Link href="/admin/products" className="text-xs text-zinc-400 hover:text-accent transition-colors">
            ← Products
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">Add Product</h1>
          <p className="text-xs text-zinc-500 mt-1">Add a new product to your store.</p>
        </div>
        <ProductForm />
      </div>
    </div>
  );
}