// app/api/tax/quote/route.js
//
// What tax this cart would attract at this address — so checkout can show
// the customer the real figure before they pay, instead of surprising them
// on the invoice.
//
// This is a preview only. The order route computes tax again from the same
// library when the order is actually placed, so a tampered or stale quote
// can never decide what's charged.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { computeTax } from "@/lib/tax";
import { productRequiresShipping } from "@/lib/shippingRequirement";
import { serverError } from "@/lib/apiError";

export async function POST(request) {
  try {
    await connectDB();
    const body = (await request.json()) || {};

    const settings = await Settings.findOne().select("tax").lean();
    const taxSettings = settings?.tax || {};
    if (!taxSettings.enabled) {
      return NextResponse.json({ success: true, data: { enabled: false, taxTotal: 0, taxLines: [], taxToAdd: 0 } });
    }

    // Same sanitising as the shipping quote: cap the cart and drop anything
    // that isn't a real id, so a malformed request is a quiet zero rather
    // than a 500.
    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 100)
      .filter((i) => i && /^[0-9a-fA-F]{24}$/.test(String(i.product)))
      .map((i) => ({
        product: String(i.product),
        quantity: Math.min(Math.max(parseInt(i.quantity, 10) || 1, 1), 500),
      }));

    if (!items.length) {
      return NextResponse.json({ success: true, data: { enabled: true, taxTotal: 0, taxLines: [], taxToAdd: 0 } });
    }

    // Prices come from the database, never from the request — a quote built
    // on client-supplied prices would show whatever the client wanted.
    const products = await Product.find({ _id: { $in: items.map((i) => i.product) } })
      .select("price discountPrice digitalProduct shippingRequirement")
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const lines = items
      .map((i) => {
        const p = byId.get(i.product);
        if (!p) return null;
        const unit = p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price;
        return { amount: unit * i.quantity, isDigital: !productRequiresShipping(p) };
      })
      .filter(Boolean);

    const shippingCost = Math.max(0, Number(body.shippingCost) || 0);
    const discountAmount = Math.max(0, Number(body.discountAmount) || 0);

    const address =
      taxSettings.basedOn === "store"
        ? { country: taxSettings.storeCountry, state: taxSettings.storeState }
        : {
            country: (typeof body.country === "string" ? body.country : "").slice(0, 80) || taxSettings.storeCountry,
            state: (typeof body.state === "string" ? body.state : "").slice(0, 80) || taxSettings.storeState,
          };

    const tax = await computeTax({ lines, shippingCost, discountAmount, address, taxSettings });

    return NextResponse.json({
      success: true,
      data: {
        enabled: true,
        taxTotal: tax.taxTotal,
        taxLines: tax.taxLines,
        taxToAdd: tax.taxToAdd,
        pricesIncludeTax: tax.pricesIncludeTax,
        zoneName: tax.zoneName,
        displayNote: taxSettings.displayNote || "",
      },
    });
  } catch (error) {
    return serverError(error, "api/tax/quote");
  }
}
