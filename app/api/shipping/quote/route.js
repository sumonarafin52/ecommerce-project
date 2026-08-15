// app/api/shipping/quote/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import ShippingZone from "@/models/ShippingZone";
import ShippingMethod from "@/models/ShippingMethod";
import Product from "@/models/Product";

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
    const { city, items = [], subtotal = 0, paymentMethod } = await request.json();

    const zone = await resolveZone(city);
    if (!zone) {
      return NextResponse.json({ success: true, data: { zone: null, methods: [] } });
    }

    const methodFilter = { zone: zone._id, active: true };
    if (paymentMethod === "cod") methodFilter.codAllowed = true;

    const methods = await ShippingMethod.find(methodFilter)
      .sort({ order: 1, name: 1 })
      .populate("carrier", "name")
      .lean();

    // total weight for weight-based methods
    let totalWeightKg = 0;
    if (items.length) {
      const products = await Product.find({ _id: { $in: items.map((i) => i.product) } }).select("weight").lean();
      const weightMap = new Map(products.map((p) => [String(p._id), p.weight || 0]));
      totalWeightKg = items.reduce((sum, i) => sum + (weightMap.get(String(i.product)) || 0) * (i.quantity || 1), 0);
    }

    const quoted = methods.map((m) => ({
      _id: m._id,
      name: m.name,
      description: m.description,
      estimatedDelivery: m.estimatedDelivery,
      carrierName: m.carrier?.name || "",
      cost: computeRate(m, totalWeightKg, subtotal),
    }));

    return NextResponse.json({ success: true, data: { zone: { _id: zone._id, name: zone.name }, methods: quoted } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
