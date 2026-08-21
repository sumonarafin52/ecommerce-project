// components/invoice/InvoiceDocument.jsx
// Pure presentational invoice layout — used by app/invoice/[id]/page.js for
// both the customer and staff views (same data, same layout). Kept
// dependency-free (no admin/customer specific styling) so it prints and
// exports to PDF cleanly regardless of who's viewing it.
"use client";

function money(n, currency = "BDT") {
  const symbol = currency === "BDT" ? "৳" : currency + " ";
  return `${symbol}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  on_hold: "On Hold",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export default function InvoiceDocument({ order, billing }) {
  const currency = billing.invoice.currency;
  const subtotal = order.baseAmount || order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = order.discountAmount || 0;
  const total = order.totalAmount;

  return (
    <div id="invoice-document" className="bg-white text-zinc-900 max-w-3xl mx-auto p-8 sm:p-10 text-sm">
      {/* Header: logo + invoice meta */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-zinc-900">
        <div>
          {billing.invoice.logo ? (
            <img src={billing.invoice.logo} alt={billing.invoice.businessName} className="h-12 w-auto object-contain mb-2" />
          ) : (
            <p className="text-xl font-extrabold">{billing.invoice.businessName}</p>
          )}
          <p className="text-xs text-zinc-500 whitespace-pre-line max-w-xs">{billing.invoice.address}</p>
          {billing.invoice.contactInfo && <p className="text-xs text-zinc-500">{billing.invoice.contactInfo}</p>}
          {billing.taxId && <p className="text-xs text-zinc-500">Tax/VAT ID: {billing.taxId}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-extrabold tracking-tight">INVOICE</p>
          <p className="text-xs text-zinc-500 mt-1">Invoice #: <span className="font-bold text-zinc-900">{order.invoiceNumber}</span></p>
          <p className="text-xs text-zinc-500">Order #: <span className="font-bold text-zinc-900">{order.orderNumber}</span></p>
          <p className="text-xs text-zinc-500">Date: {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
        </div>
      </div>

      {/* Bill to / Ship to */}
      <div className="grid sm:grid-cols-2 gap-6 py-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Billed To</p>
          <p className="font-bold">{order.user?.name}</p>
          <p className="text-xs text-zinc-500">{order.user?.email}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Shipping Address</p>
          <p className="font-bold">{order.shippingAddress?.fullName}</p>
          <p className="text-xs text-zinc-500">
            {order.shippingAddress?.address}, {order.shippingAddress?.city}
            {order.shippingAddress?.state ? `, ${order.shippingAddress.state}` : ""}
            {order.shippingAddress?.postalCode ? ` ${order.shippingAddress.postalCode}` : ""}
            {order.shippingAddress?.country ? `, ${order.shippingAddress.country}` : ""}
          </p>
          <p className="text-xs text-zinc-500">{order.shippingAddress?.phone}</p>
        </div>
      </div>

      {/* Payment / order status strip */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 py-4 border-y border-zinc-200 text-xs">
        <p><span className="text-zinc-400">Payment Method:</span> <span className="font-bold uppercase">{order.paymentMethod}</span></p>
        <p><span className="text-zinc-400">Payment Status:</span> <span className="font-bold capitalize">{order.paymentStatus}</span></p>
        <p><span className="text-zinc-400">Order Status:</span> <span className="font-bold">{STATUS_LABELS[order.orderStatus] || order.orderStatus}</span></p>
      </div>

      {/* Line items */}
      <table className="w-full mt-6 text-xs">
        <thead>
          <tr className="border-b-2 border-zinc-900 text-left">
            <th className="py-2 font-bold">Product</th>
            <th className="py-2 font-bold">SKU</th>
            <th className="py-2 font-bold text-center">Qty</th>
            <th className="py-2 font-bold text-right">Unit Price</th>
            <th className="py-2 font-bold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={i} className="border-b border-zinc-100">
              <td className="py-2.5 pr-2">{item.name}</td>
              <td className="py-2.5 text-zinc-500">{item.sku || "—"}</td>
              <td className="py-2.5 text-center">{item.quantity}</td>
              <td className="py-2.5 text-right">{money(item.price, currency)}</td>
              <td className="py-2.5 text-right font-semibold">{money(item.price * item.quantity, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-4">
        <div className="w-full max-w-xs space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Subtotal</span>
            <span>{money(subtotal, currency)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount {order.discountCode && `(${order.discountCode})`}</span>
              <span>-{money(discount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-500">Shipping {order.shippingMethodName && `(${order.shippingMethodName})`}</span>
            <span>{order.shippingCost > 0 ? money(order.shippingCost, currency) : "Free"}</span>
          </div>
          {billing.invoice.taxInfo && (
            <div className="flex justify-between">
              <span className="text-zinc-500">{billing.invoice.taxInfo}</span>
              <span>Included</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-zinc-900 font-extrabold text-base">
            <span>Total</span>
            <span>{money(total, currency)}</span>
          </div>
        </div>
      </div>

      {billing.invoice.paymentInfo && (
        <div className="mt-8 text-xs text-zinc-500 whitespace-pre-line">
          <p className="font-bold text-zinc-700 mb-1">Payment Information</p>
          {billing.invoice.paymentInfo}
        </div>
      )}

      {billing.invoice.additionalNotes && (
        <div className="mt-4 text-xs text-zinc-500 whitespace-pre-line">{billing.invoice.additionalNotes}</div>
      )}

      <div className="mt-10 pt-6 border-t border-zinc-200 text-center text-xs text-zinc-400">
        {billing.invoice.footerText}
      </div>
    </div>
  );
}
