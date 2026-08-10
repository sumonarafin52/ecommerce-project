// components/admin/ProductTable.jsx
"use client";

import { formatCurrency, getEffectivePrice } from "@/lib/utils";

export default function ProductTable({ products = [], onEdit, onDelete }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">
        No products yet. Add your first product!
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-primary-light border border-white/10 rounded-xl">
      <table className="w-full text-sm text-left min-w-[640px]">
        <thead>
          <tr className="text-zinc-400 border-b border-white/10">
            <th className="p-4 font-medium">Product</th>
            <th className="p-4 font-medium">Category</th>
            <th className="p-4 font-medium">Price</th>
            <th className="p-4 font-medium">Stock</th>
            <th className="p-4 font-medium">Rating</th>
            <th className="p-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black/30 rounded-md overflow-hidden shrink-0">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                  <span className="font-medium text-white line-clamp-1 max-w-[180px]">{p.name}</span>
                </div>
              </td>
              <td className="p-4 text-zinc-300">{p.category}</td>
              <td className="p-4">
                <span className="font-bold text-accent">{formatCurrency(getEffectivePrice(p))}</span>
                {p.discountPrice > 0 && (
                  <span className="ml-2 text-xs text-zinc-500 line-through">{formatCurrency(p.price)}</span>
                )}
              </td>
              <td className="p-4">
                <span
                  className={
                    p.stock <= 0
                      ? "text-red-400 font-bold"
                      : p.stock <= 5
                      ? "text-accent font-bold"
                      : "text-green-400"
                  }
                >
                  {p.stock}
                </span>
              </td>
              <td className="p-4 text-zinc-300">{p.ratingAvg.toFixed(1)} ★</td>
              <td className="p-4 text-right whitespace-nowrap">
                <button
                  onClick={() => onEdit(p)}
                  className="text-zinc-300 hover:text-accent font-bold text-xs border border-white/15 hover:border-accent rounded-md px-3 py-1.5 mr-2 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(p._id)}
                  className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-md px-3 py-1.5 transition-colors"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}