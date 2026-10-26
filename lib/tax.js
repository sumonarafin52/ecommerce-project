// lib/tax.js
//
// Works out the tax on an order. Everything here runs server-side; the
// storefront only ever displays what this returned.
//
// Two things make tax more than "multiply by a percentage":
//
// 1. INCLUSIVE vs EXCLUSIVE pricing. In Bangladesh (and most of Europe and
//    Asia) the shelf price already contains the tax, so tax is *extracted*
//    from the price and the customer pays exactly the price shown. In the
//    US the price is pre-tax and the tax is *added* at checkout. Getting
//    this backwards either overcharges every customer by the tax rate or
//    hands the tax authority money the store never collected.
//
// 2. DISCOUNTS. Tax is owed on what the customer actually paid, not on the
//    list price, so a coupon has to be spread across the lines before tax
//    is worked out — otherwise a 50%-off order is taxed at full price.
//
// Digital and physical goods are kept separate throughout, because rates
// commonly differ and some jurisdictions tax one and not the other.
import TaxZone from "@/models/TaxZone";
import TaxRate from "@/models/TaxRate";
import { productRequiresShipping } from "@/lib/shippingRequirement";

/** Money is rounded to 2 decimals at each published figure, never mid-sum. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const norm = (s) => String(s || "").trim().toLowerCase();

/**
 * Picks the zone that applies to an address.
 *
 * Specificity wins over configuration order: country+state beats country,
 * which beats a catch-all (a zone with no countries listed). `priority`
 * only breaks ties between equally specific zones.
 */
export async function resolveTaxZone({ country, state }) {
  const zones = await TaxZone.find({ active: true }).lean();
  if (!zones.length) return null;

  const c = norm(country);
  const s = norm(state);

  const scored = [];
  for (const z of zones) {
    const countries = (z.countries || []).map(norm).filter(Boolean);
    const states = (z.states || []).map(norm).filter(Boolean);

    // A zone listing countries only applies inside them.
    if (countries.length && !countries.includes(c)) continue;
    // A zone listing states only applies inside them.
    if (states.length && !states.includes(s)) continue;

    // 2 = country + state, 1 = country, 0 = catch-all
    const specificity = (countries.length ? 1 : 0) + (states.length ? 1 : 0);
    scored.push({ zone: z, specificity });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.specificity - a.specificity || (b.zone.priority || 0) - (a.zone.priority || 0));
  return scored[0].zone;
}

/** The active rates for a zone, ordered so compound ones come last. */
export async function ratesForZone(zoneId) {
  const rates = await TaxRate.find({ zone: zoneId, active: true }).lean();
  return rates.sort((a, b) => {
    if (!!a.compound !== !!b.compound) return a.compound ? 1 : -1;
    return (b.priority || 0) - (a.priority || 0);
  });
}

function rateApplies(rate, isDigital) {
  if (rate.appliesTo === "all") return true;
  return rate.appliesTo === (isDigital ? "digital" : "physical");
}

/**
 * Computes tax for an order.
 *
 * @param {Object[]} lines  [{ amount, isDigital }] — amount is the line
 *   total BEFORE any discount, in store currency.
 * @param {number} shippingCost
 * @param {number} discountAmount  spread proportionally across lines
 * @param {Object} address  { country, state }
 * @param {Object} taxSettings  { enabled, pricesIncludeTax }
 *
 * Returns a result that is safe to store on the order and show to the
 * customer. When tax is switched off, or no zone matches, it returns zeroes
 * rather than guessing — a store that hasn't configured tax should see the
 * same totals it saw before this existed.
 */
export async function computeTax({ lines = [], shippingCost = 0, discountAmount = 0, address = {}, taxSettings = {} }) {
  const pricesIncludeTax = !!taxSettings.pricesIncludeTax;

  const empty = {
    taxTotal: 0,
    taxLines: [],
    zoneName: "",
    pricesIncludeTax,
    // What to add to the order total. Zero for inclusive pricing, because
    // the tax is already inside the prices.
    taxToAdd: 0,
  };

  if (!taxSettings.enabled) return empty;

  const zone = await resolveTaxZone(address);
  if (!zone) return empty;

  const rates = await ratesForZone(zone._id);
  if (!rates.length) return { ...empty, zoneName: zone.name };

  // --- spread the discount across lines -------------------------------
  // Tax is owed on what was actually paid. Allocating proportionally keeps
  // the split between digital and physical honest when they're taxed at
  // different rates.
  const gross = lines.reduce((s, l) => s + Math.max(0, Number(l.amount) || 0), 0);
  const discount = Math.min(Math.max(0, Number(discountAmount) || 0), gross);
  const taxable = lines.map((l) => {
    const amount = Math.max(0, Number(l.amount) || 0);
    const share = gross > 0 ? (amount / gross) * discount : 0;
    return { amount: amount - share, isDigital: !!l.isDigital };
  });

  const ship = Math.max(0, Number(shippingCost) || 0);

  // --- apply each rate -------------------------------------------------
  const taxLines = [];
  // Running total of non-compound tax per base, so a compound rate can be
  // charged on top of it.
  let baseTaxOnGoods = 0;
  let baseTaxOnShipping = 0;

  for (const rate of rates) {
    const pct = Number(rate.rate) || 0;
    if (pct <= 0) continue;

    const goodsBase = taxable.filter((l) => rateApplies(rate, l.isDigital)).reduce((s, l) => s + l.amount, 0);
    // Shipping is only ever taxed once, under rates that cover physical
    // goods — a digital-only rate must not tax delivery.
    const shippingBase = rate.taxShipping && rate.appliesTo !== "digital" ? ship : 0;

    let base = goodsBase + shippingBase;
    if (rate.compound) base += baseTaxOnGoods + baseTaxOnShipping;
    if (base <= 0) continue;

    let amount;
    if (pricesIncludeTax) {
      // The price already contains this tax: back it out rather than
      // adding it. net = gross / (1 + r), tax = gross - net.
      amount = base - base / (1 + pct / 100);
    } else {
      amount = base * (pct / 100);
    }
    amount = round2(amount);
    if (amount <= 0) continue;

    if (!rate.compound) {
      baseTaxOnGoods += goodsBase * (pct / 100);
      baseTaxOnShipping += shippingBase * (pct / 100);
    }

    taxLines.push({
      name: rate.name,
      rate: pct,
      amount,
      appliesTo: rate.appliesTo,
      compound: !!rate.compound,
    });
  }

  const taxTotal = round2(taxLines.reduce((s, t) => s + t.amount, 0));

  return {
    taxTotal,
    taxLines,
    zoneName: zone.name,
    pricesIncludeTax,
    // Inclusive pricing means the customer already paid it — adding it
    // again would double-charge.
    taxToAdd: pricesIncludeTax ? 0 : taxTotal,
  };
}

/**
 * Builds the `lines` argument from an order's items and their products.
 * Kept here so the order route and the checkout preview can't disagree
 * about which items count as digital.
 */
export function taxLinesFromItems(items, products) {
  const byId = new Map((products || []).map((p) => [String(p._id), p]));
  return (items || []).map((it) => {
    const product = byId.get(String(it.product?._id || it.product));
    return {
      amount: (Number(it.price) || 0) * (Number(it.quantity) || 0),
      // "digital" for tax means it isn't shipped — the same rule checkout
      // uses to decide whether to ask for an address.
      isDigital: product ? !productRequiresShipping(product) : false,
    };
  });
}
