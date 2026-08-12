// app/admin/products/[id]/edit/page.js
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import usePermissions from "@/lib/usePermissions";
import ProductForm from "@/components/admin/ProductForm";

export default function EditProductPage() {
  const params = useParams();
  const { data: session, status } = useSession();
  const { can, loading: permLoading } = usePermissions();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProduct(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (status === "loading" || permLoading || loading) {
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

  if (!product) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Product not found</p>
        <Link href="/admin/products" className="text-accent hover:underline text-sm">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        <div>
          <Link href="/admin/products" className="text-xs text-zinc-400 hover:text-accent transition-colors">
            ← Products
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">Edit: {product.name}</h1>
          <p className="text-xs text-zinc-500 mt-1 capitalize">
            Status: <span className="text-accent font-bold">{product.status}</span> • SKU: {product.sku || "—"}
          </p>
        </div>
        <ProductForm initial={product} key={product._id} />
      </div>
    </div>
  );
}