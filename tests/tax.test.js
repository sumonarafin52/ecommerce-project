// tests/tax.test.js
//
// The tax maths, tested before it's wired to anything that takes money.
//
// The cases that matter are the ones where a wrong answer is expensive:
// inclusive pricing (getting it backwards overcharges every customer by the
// rate), discounts (taxing the list price instead of what was paid),
// digital vs physical rates, and shipping.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import TaxZone from "@/models/TaxZone";
import TaxRate from "@/models/TaxRate";
import { computeTax, resolveTaxZone, taxLinesFromItems } from "@/lib/tax";

const ON = { enabled: true, pricesIncludeTax: false };
const INCLUSIVE = { enabled: true, pricesIncludeTax: true };

const bdAddress = { country: "Bangladesh", state: "Dhaka District" };

async function bdVat(rate = 15, over = {}) {
  const zone = await TaxZone.create({ name: "Bangladesh", countries: ["Bangladesh"], active: true });
  await TaxRate.create({ zone: zone._id, name: "VAT", rate, active: true, ...over });
  return zone;
}

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
});

describe("exclusive pricing — tax added on top", () => {
  it("adds the rate to the goods", async () => {
    await bdVat(15);
    const res = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      address: bdAddress,
      taxSettings: ON,
    });
    expect(res.taxTotal).toBe(150);
    expect(res.taxToAdd).toBe(150); // the customer pays 1150
    expect(res.taxLines[0].name).toBe("VAT");
  });

  it("taxes shipping when the rate says to, and not when it doesn't", async () => {
    await bdVat(10);
    const withShipping = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      shippingCost: 100,
      address: bdAddress,
      taxSettings: ON,
    });
    expect(withShipping.taxTotal).toBe(110); // 10% of 1100

    await clearTestDB();
    await bdVat(10, { taxShipping: false });
    const without = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      shippingCost: 100,
      address: bdAddress,
      taxSettings: ON,
    });
    expect(without.taxTotal).toBe(100); // 10% of the goods only
  });
});

describe("inclusive pricing — tax already inside the price", () => {
  it("extracts the tax instead of adding it", async () => {
    await bdVat(15);
    const res = await computeTax({
      lines: [{ amount: 1150, isDigital: false }],
      address: bdAddress,
      taxSettings: INCLUSIVE,
    });
    // 1150 inclusive of 15% = 1000 net + 150 tax
    expect(res.taxTotal).toBe(150);
    // and nothing is added — the customer pays the price on the label
    expect(res.taxToAdd).toBe(0);
  });

  it("never changes what the customer pays", async () => {
    await bdVat(15);
    const price = 90; // the ৳90 ice cream from the storefront
    const res = await computeTax({
      lines: [{ amount: price, isDigital: false }],
      address: bdAddress,
      taxSettings: INCLUSIVE,
    });
    expect(res.taxToAdd).toBe(0);
    // the extracted tax is a slice of the 90, not an addition to it
    expect(res.taxTotal).toBeLessThan(price);
    expect(res.taxTotal).toBeCloseTo(11.74, 2);
  });

  it("is not the same as the exclusive figure — the bug that would cost real money", async () => {
    await bdVat(15);
    const args = { lines: [{ amount: 1000, isDigital: false }], address: bdAddress };
    const exclusive = await computeTax({ ...args, taxSettings: ON });
    const inclusive = await computeTax({ ...args, taxSettings: INCLUSIVE });
    expect(exclusive.taxTotal).toBe(150);
    expect(inclusive.taxTotal).toBeCloseTo(130.43, 2);
  });
});

describe("discounts", () => {
  it("taxes what was actually paid, not the list price", async () => {
    await bdVat(10);
    const res = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      discountAmount: 400,
      address: bdAddress,
      taxSettings: ON,
    });
    expect(res.taxTotal).toBe(60); // 10% of 600, not of 1000
  });

  it("spreads the discount across lines proportionally", async () => {
    // digital taxed at 5%, physical at 15% — the split has to be honest
    const zone = await TaxZone.create({ name: "BD", countries: ["Bangladesh"], active: true });
    await TaxRate.create({ zone: zone._id, name: "VAT", rate: 15, appliesTo: "physical", active: true });
    await TaxRate.create({ zone: zone._id, name: "Digital VAT", rate: 5, appliesTo: "digital", active: true });

    const res = await computeTax({
      lines: [
        { amount: 750, isDigital: false },
        { amount: 250, isDigital: true },
      ],
      discountAmount: 200, // 75% / 25% split -> 150 and 50
      address: bdAddress,
      taxSettings: ON,
    });

    const physical = res.taxLines.find((l) => l.appliesTo === "physical");
    const digital = res.taxLines.find((l) => l.appliesTo === "digital");
    expect(physical.amount).toBe(90); // 15% of 600
    expect(digital.amount).toBe(10); // 5% of 200
    expect(res.taxTotal).toBe(100);
  });

  it("a discount larger than the order doesn't produce negative tax", async () => {
    await bdVat(15);
    const res = await computeTax({
      lines: [{ amount: 500, isDigital: false }],
      discountAmount: 9999,
      address: bdAddress,
      taxSettings: ON,
    });
    expect(res.taxTotal).toBe(0);
  });
});

describe("digital vs physical", () => {
  it("a digital-only rate doesn't touch physical goods, or shipping", async () => {
    const zone = await TaxZone.create({ name: "EU", countries: ["Germany"], active: true });
    await TaxRate.create({ zone: zone._id, name: "Digital VAT", rate: 19, appliesTo: "digital", active: true });

    const res = await computeTax({
      lines: [
        { amount: 100, isDigital: true },
        { amount: 100, isDigital: false },
      ],
      shippingCost: 50,
      address: { country: "Germany" },
      taxSettings: ON,
    });
    // only the 100 of digital goods is taxed; the physical item and the
    // delivery charge are left alone
    expect(res.taxTotal).toBe(19);
  });

  it("derives digital-ness from the product, not from the request", () => {
    const items = [
      { product: "a", price: 100, quantity: 2 },
      { product: "b", price: 50, quantity: 1 },
    ];
    const products = [
      { _id: "a", digitalProduct: "dp1", shippingRequirement: "auto" }, // digital
      { _id: "b", digitalProduct: null, shippingRequirement: "auto" }, // physical
    ];
    const lines = taxLinesFromItems(items, products);
    expect(lines).toEqual([
      { amount: 200, isDigital: true },
      { amount: 50, isDigital: false },
    ]);
  });

  it("treats an unknown product as physical rather than untaxed", () => {
    const lines = taxLinesFromItems([{ product: "missing", price: 10, quantity: 1 }], []);
    expect(lines[0].isDigital).toBe(false);
  });
});

describe("zone matching", () => {
  it("prefers country+state over country, and country over a catch-all", async () => {
    await TaxZone.create({ name: "Worldwide", countries: [], active: true });
    await TaxZone.create({ name: "Bangladesh", countries: ["Bangladesh"], active: true });
    await TaxZone.create({ name: "Dhaka", countries: ["Bangladesh"], states: ["Dhaka District"], active: true });

    expect((await resolveTaxZone({ country: "Bangladesh", state: "Dhaka District" })).name).toBe("Dhaka");
    expect((await resolveTaxZone({ country: "Bangladesh", state: "Khulna" })).name).toBe("Bangladesh");
    expect((await resolveTaxZone({ country: "France" })).name).toBe("Worldwide");
  });

  it("ignores case and surrounding spaces", async () => {
    await TaxZone.create({ name: "BD", countries: ["Bangladesh"], active: true });
    expect((await resolveTaxZone({ country: "  bangladesh " })).name).toBe("BD");
  });

  it("skips inactive zones", async () => {
    await TaxZone.create({ name: "Off", countries: ["Bangladesh"], active: false });
    expect(await resolveTaxZone({ country: "Bangladesh" })).toBeNull();
  });

  it("breaks a tie on priority", async () => {
    await TaxZone.create({ name: "Low", countries: ["Bangladesh"], priority: 1, active: true });
    await TaxZone.create({ name: "High", countries: ["Bangladesh"], priority: 5, active: true });
    expect((await resolveTaxZone({ country: "Bangladesh" })).name).toBe("High");
  });
});

describe("several rates in one zone", () => {
  it("charges each one and lists them separately on the invoice", async () => {
    const zone = await TaxZone.create({ name: "California", countries: ["United States"], states: ["California"], active: true });
    await TaxRate.create({ zone: zone._id, name: "State tax", rate: 6, active: true });
    await TaxRate.create({ zone: zone._id, name: "County tax", rate: 1.25, active: true });

    const res = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      address: { country: "United States", state: "California" },
      taxSettings: ON,
    });
    expect(res.taxLines).toHaveLength(2);
    expect(res.taxTotal).toBe(72.5);
  });

  it("a compound rate is charged on the amount plus the taxes before it", async () => {
    const zone = await TaxZone.create({ name: "Compound land", countries: ["Canada"], active: true });
    await TaxRate.create({ zone: zone._id, name: "GST", rate: 5, active: true });
    await TaxRate.create({ zone: zone._id, name: "PST", rate: 10, compound: true, active: true });

    const res = await computeTax({
      lines: [{ amount: 100, isDigital: false }],
      address: { country: "Canada" },
      taxSettings: ON,
    });
    // GST 5 on 100 = 5; PST 10% on (100 + 5) = 10.50
    const gst = res.taxLines.find((l) => l.name === "GST");
    const pst = res.taxLines.find((l) => l.name === "PST");
    expect(gst.amount).toBe(5);
    expect(pst.amount).toBe(10.5);
    expect(res.taxTotal).toBe(15.5);
  });
});

describe("a store that hasn't set tax up sees no change", () => {
  it("returns zero when tax is switched off, even with zones configured", async () => {
    await bdVat(15);
    const res = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      address: bdAddress,
      taxSettings: { enabled: false, pricesIncludeTax: false },
    });
    expect(res.taxTotal).toBe(0);
    expect(res.taxToAdd).toBe(0);
    expect(res.taxLines).toEqual([]);
  });

  it("returns zero when no zone covers the address", async () => {
    await bdVat(15);
    const res = await computeTax({
      lines: [{ amount: 1000, isDigital: false }],
      address: { country: "Japan" },
      taxSettings: ON,
    });
    expect(res.taxTotal).toBe(0);
  });

  it("returns zero when the zone has no rates", async () => {
    await TaxZone.create({ name: "Empty", countries: ["Bangladesh"], active: true });
    const res = await computeTax({ lines: [{ amount: 1000 }], address: bdAddress, taxSettings: ON });
    expect(res.taxTotal).toBe(0);
    expect(res.zoneName).toBe("Empty");
  });

  it("ignores a zero or inactive rate", async () => {
    const zone = await TaxZone.create({ name: "BD", countries: ["Bangladesh"], active: true });
    await TaxRate.create({ zone: zone._id, name: "Zero", rate: 0, active: true });
    await TaxRate.create({ zone: zone._id, name: "Disabled", rate: 20, active: false });
    const res = await computeTax({ lines: [{ amount: 1000 }], address: bdAddress, taxSettings: ON });
    expect(res.taxTotal).toBe(0);
  });
});

describe("rounding", () => {
  it("publishes each tax line to two decimals", async () => {
    await bdVat(7.25);
    const res = await computeTax({
      lines: [{ amount: 33.33, isDigital: false }],
      address: bdAddress,
      taxSettings: ON,
    });
    expect(res.taxTotal).toBe(2.42);
    expect(String(res.taxTotal).split(".")[1]?.length || 0).toBeLessThanOrEqual(2);
  });

  it("the sum of the lines equals the reported total", async () => {
    const zone = await TaxZone.create({ name: "Many", countries: ["Bangladesh"], active: true });
    await TaxRate.create({ zone: zone._id, name: "A", rate: 3.33, active: true });
    await TaxRate.create({ zone: zone._id, name: "B", rate: 1.11, active: true });
    const res = await computeTax({ lines: [{ amount: 777.77 }], address: bdAddress, taxSettings: ON });
    const summed = res.taxLines.reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(summed - res.taxTotal)).toBeLessThan
      ? expect(Math.abs(summed - res.taxTotal)).toBeLessThan(0.005)
      : null;
  });
});
