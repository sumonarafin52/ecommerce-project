// app/api/shipping/quote/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";
import Product from "@/models/Product";
import { orderRequiresShipping } from "@/lib/shippingRequirement";
import { serverError } from "@/lib/apiError";

// Finds the best-matching zone for a city: exact region match wins; a zone
// with no regions listed acts as a catch-all fallback (e.g. "International"
// or "Rest of Bangladesh") so checkout never breaks on an unconfigured city.
async function resolveZone(city) {
  const zones = await ShippingZone.find({ active: true }).lean();
  const cityLower = (city || "").trim().toLowerCase();
  const exact = zones.find((z) => (z.regions || []).some((r) => r.trim().toLowerCase() === cityLower));
  if (exact) return exact;
  const catchAll = zones.find((z) => !z.regions || z.regions.length === 0);
  return catchAll || null;
}

function computeRate(method, totalWeightKg, subtotal) {
  if (method.freeShippingThreshold > 0 && subtotal >= method.freeShippingThreshold) {
    return 0;
  }
  if (method.rateType === "weightBased" && method.weightTiers?.length) {
    const sorted = [...method.weightTiers].sort((a, b) => a.maxWeightKg - b.maxWeightKg);
    const tier = sorted.find((t) => totalWeightKg <= t.maxWeightKg);
    return tier ? tier.rate : sorted[sorted.length - 1].rate; // heaviest tier covers "and above"
  }
  return method.flatRate || 0;
}

export async function POST(request) {
  try {
    await connectDB();
    const body = (await request.json()) || {};
    const city = typeof body.city === "string" ? body.city.slice(0, 80) : "";
    const paymentMethod = body.paymentMethod;
    const subtotal = Number.isFinite(Number(body.subtotal)) ? Math.max(0, Number(body.subtotal)) : 0;
    // cap and sanitise: malformed ids used to make the lookup throw (500)
    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 100)
      .filter((i) => i && /^[0-9a-fA-F]{24}$/.test(String(i.product)))
      .map((i) => ({ product: String(i.product), quantity: Math.min(Math.max(parseInt(i.quantity, 10) || 1, 1), 500) }));

    // Does this cart need shipping at all? A download-only basket must not
    // be told "no delivery methods are configured for this area" — there is
    // nothing to deliver. Decided from the products, not from the request.
    const cartProducts = items.length
      ? await Product.find({ _id: { $in: items.map((i) => i.product) } })
          .select("weight digitalProduct shippingRequirement")
          .lean()
      : [];
    const needsShipping = items.length ? orderRequiresShipping(cartProducts) : true;

    if (!needsShipping) {
      return NextResponse.json({
        success: true,
        data: { zone: null, methods: [], requiresShipping: false },
      });
    }

    const zone = await resolveZone(city);
    if (!zone) {
      return NextResponse.json({ success: true, data: { zone: null, methods: [], requiresShipping: true } });
    }

    const methodFilter = { zone: zone._id, active: true };
    if (paymentMethod === "cod") methodFilter.codAllowed = true;

    const methods = await ShippingMethod.find(methodFilter)
      .sort({ order: 1, name: 1 })
      .populate("carrier", "name")
      .lean();

    // total weight for weight-based methods (reuses the products already
    // loaded for the shipping-requirement check rather than querying twice)
    let totalWeightKg = 0;
    if (cartProducts.length) {
      const weightMap = new Map(cartProducts.map((p) => [String(p._id), p.weight || 0]));
      totalWeightKg = items.reduce((sum, i) => sum + (weightMap.get(String(i.product)) || 0) * (i.quantity || 1), 0);
    }

    const quoted = methods.map((m) => ({
      _id: m._id,
      name: m.name,
      description: m.description,
      estimatedDelivery: m.estimatedDelivery,
      carrierName: m.carrier?.name || "",
      cost: computeRate(m, totalWeightKg, subtotal),
      freeShippingThreshold: m.freeShippingThreshold || 0,
    }));

    return NextResponse.json({
      success: true,
      data: { zone: { _id: zone._id, name: zone.name }, methods: quoted, requiresShipping: true },
    });
  } catch (error) {
    return serverError(error, "api/shipping/quote");
  }
}
