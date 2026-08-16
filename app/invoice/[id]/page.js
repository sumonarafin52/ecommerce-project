// app/invoice/[id]/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";

export default function InvoicePage() {
  const { id } = useParams();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=/invoice/${id}`);
      return;
    }
    if (status !== "authenticated") return;

    fetch(`/api/orders/${id}/invoice`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(res.message || "Could not load invoice");
      })
      .catch(() => setError("Could not load invoice"));
  }, [status, id, router]);

  const downloadPdf = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`invoice-${data.order.invoiceNumber || data.order.orderNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-bold text-lg">{error}</p>
          <Link href="/" className="text-accent text-sm font-bold hover:underline mt-2 inline-block">Go home</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4">
      {/* toolbar — hidden when printing */}
      <div className="max-w-3xl mx-auto flex items-center justify-between mb-4 print:hidden">
        <Link href="/" className="text-sm font-bold text-zinc-600 hover:text-accent">← Back</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
          >
            Print
          </button>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-60"
          >
            {downloading ? "Preparing..." : "Download PDF"}
          </button>
        </div>
      </div>

      <div ref={printRef} className="shadow-lg print:shadow-none">
        <InvoiceDocument order={data.order} billing={data.billing} />
      </div>
    </div>
  );
}
