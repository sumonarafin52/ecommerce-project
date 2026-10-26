// app/admin/orders/packing-slips/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import usePermissions from "@/lib/usePermissions";
import useStoreSettings from "@/lib/useStoreSettings";
import { formatCurrency, formatDate } from "@/lib/utils";
import PermissionGate from "@/components/admin/ui/PermissionGate";

// Picking/packing sheet — what goes in the box, where it's going, and how
// much to collect. Deliberately plain: it's meant to be printed in black
// and white on a cheap printer.
export default function PackingSlipsPage() {
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions } = usePermissions();
  const settings = useStoreSettings();
  const [orders, setOrders] = useState(null);
  const [ids, setIds] = useState([]);

  useEffect(() => {
    // ids come from the Orders page selection (?ids=a,b,c)
    const raw = new URLSearchParams(window.location.search).get("ids") || "";
    setIds(raw.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-fA-F]{24}$/.test(s)).slice(0, 100));
  }, []);

  useEffect(() => {
    if (permLoading || !can("orders") || ids.length === 0) return;
    Promise.all(
      ids.map((id) =>
        fetch(`/api/orders/${id}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((res) => (res.success ? res.data : null))
          .catch(() => null)
      )
    ).then((list) => setOrders(list.filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, permLoading]);
  if (permLoading || permFailed || !can("orders")) {
    return (
      <PermissionGate
        perm="orders"
        what="orders"
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  const store = settings?.general || {};

  return (
    <div className="bg-white min-h-screen text-[#1a1a1a]">
      {/* toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold">Packing slips</h1>
          <p className="text-xs text-gray-500">
            {orders ? `${orders.length} order${orders.length === 1 ? "" : "s"}` : "Loading…"} · one per page
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/orders" className="text-sm font-bold border border-gray-300 px-4 py-2 rounded-lg">
            Back
          </Link>
          <button
            onClick={() => window.print()}
            disabled={!orders?.length}
            className="text-sm font-bold bg-[#2C5282] text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Print
          </button>
        </div>
      </div>

      {ids.length === 0 ? (
        <p className="p-8 text-sm text-gray-600">
          No orders selected. Pick orders on the{" "}
          <Link href="/admin/orders" className="font-bold text-[#2C5282] underline">
            Orders page
          </Link>{" "}
          and choose “Packing slips”.
        </p>
      ) : !orders ? (
        <p className="p-8 text-sm text-gray-600">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="p-8 text-sm text-gray-600">Couldn&apos;t load those orders.</p>
      ) : (
        orders.map((o) => {
          const a = o.shippingAddress || {};
          const cod = o.paymentMethod === "cod" && o.paymentStatus !== "paid";
          return (
            <section key={o._id} className="max-w-[760px] mx-auto px-8 py-8 break-after-page">
              <div className="flex justify-between items-start border-b-2 border-black pb-3">
                <div>
                  <p className="text-lg font-bold">{store.storeName || "Order"}</p>
                  {store.storePhone && <p className="text-xs">{store.storePhone}</p>}
                  {store.storeAddress && <p className="text-xs">{store.storeAddress}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Packing slip</p>
                  <p className="text-lg font-bold font-mono">{o.orderNumber}</p>
                  <p className="text-xs">{formatDate(o.createdAt)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-5 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Deliver to</p>
                  <p className="font-bold mt-1">{a.fullName}</p>
                  <p>{a.phone}</p>
                  <p className="text-gray-700">{[a.address, a.city, a.state, a.postalCode].filter(Boolean).join(", ")}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Payment</p>
                  <p className="mt-1">{o.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"}</p>
                  {o.shippingMethodName && <p className="text-gray-700">Via {o.shippingMethodName}</p>}
                </div>
              </div>

              {cod && (
                <div className="mt-4 border-2 border-black px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm font-bold uppercase">Collect on delivery</span>
                  <span className="text-xl font-bold">{formatCurrency(o.totalAmount)}</span>
                </div>
              )}

              <table className="w-full mt-5 text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="py-1.5 w-10">✓</th>
                    <th className="py-1.5">Item</th>
                    <th className="py-1.5 w-24">SKU</th>
                    <th className="py-1.5 w-14 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(o.items || []).map((it, i) => (
                    <tr key={i} className="border-b border-gray-300">
                      <td className="py-2"><span className="inline-block w-4 h-4 border border-black" /></td>
                      <td className="py-2">
                        {it.name}
                        {it.combinationKey && <span className="text-gray-600"> ({it.combinationKey})</span>}
                      </td>
                      <td className="py-2 text-gray-600">{it.product?.sku || "—"}</td>
                      <td className="py-2 text-right font-bold">{it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-xs text-gray-500 mt-4">
                {(o.items || []).reduce((n, i) => n + i.quantity, 0)} item(s) total
              </p>
            </section>
          );
        })
      )}

      <style jsx global>{`
        @media print {
          /* the admin shell would otherwise print around every slip */
          header, nav, aside, footer { display: none !important; }
          .break-after-page { break-after: page; }
          .break-after-page:last-child { break-after: auto; }
          @page { margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
