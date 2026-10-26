// tests/adminStats.test.js
//
// The figures on Reports & Analytics, counted through the real aggregation.
//
// The rule this file guards is the one in the project's own instructions:
// only show accurate data. Every assertion here is a number a shop owner
// would make a decision on — which day the money landed, whether revenue
// is up or down, and whether a buyer is new or coming back.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import User from "@/models/User";
import Settings from "@/models/Settings";

let mockSession = { user: { id: "000000000000000000000001", role: "admin" } };
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const { GET } = await import("@/app/api/admin/stats/route");
const { clearTimezoneCache } = await import("@/lib/storeTime");

const stats = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return GET(new Request(`http://localhost/api/admin/stats${qs ? `?${qs}` : ""}`)).then((r) => r.json());
};

let n = 0;
const order = (at, o = {}) => {
  const seq = ++n;
  return Order.create({
    orderNumber: `ORD-${seq}`,
    user: o.user || null,
    // An order must belong to somebody — the model enforces it. Tests that
    // aren't about identity get their own one-off guest.
    guestEmail: o.user ? undefined : o.guestEmail || `buyer${seq}@example.com`,
    items: [{ product: "000000000000000000000009", name: "Thing", quantity: 1, price: o.total ?? 1000 }],
    shippingAddress: { fullName: "A", phone: "01700000000", address: "x", city: "Dhaka", country: "Bangladesh" },
    totalAmount: o.total ?? 1000,
    paymentMethod: o.paymentMethod || "sslcommerz",
    paymentStatus: o.paymentStatus || "paid",
    orderStatus: o.orderStatus || "processing",
    createdAt: new Date(at),
    ...(o.extra || {}),
  });
};

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  clearTimezoneCache();
  mockSession = { user: { id: "000000000000000000000001", role: "admin" } };
});

describe("which day the money landed on", () => {
  it("counts a late-night order on the shop's date, not the server's", async () => {
    await Settings.create({ general: { timezone: "Asia/Dhaka" } });
    // 02:30 on the 16th in Dhaka. Before the fix this appeared under the
    // 15th, because MongoDB bucketed the day in UTC.
    await order("2026-10-15T20:30:00Z", { total: 1500 });

    const res = await stats({ from: "2026-10-14T00:00:00Z", to: "2026-10-17T00:00:00Z" });
    const paid = res.data.daily.filter((d) => d.revenue > 0);

    expect(paid).toHaveLength(1);
    expect(paid[0].date).toBe("2026-10-16");
    expect(paid[0].revenue).toBe(1500);
  });

  it("follows the shop's timezone when it changes", async () => {
    await Settings.create({ general: { timezone: "UTC" } });
    await order("2026-10-15T20:30:00Z", { total: 1500 });

    const utc = await stats({ from: "2026-10-14T00:00:00Z", to: "2026-10-17T00:00:00Z" });
    expect(utc.data.daily.find((d) => d.revenue > 0).date).toBe("2026-10-15");
    expect(utc.data.timezone).toBe("UTC");

    await Settings.updateOne({}, { $set: { "general.timezone": "Asia/Dhaka" } });
    clearTimezoneCache();

    const dhaka = await stats({ from: "2026-10-14T00:00:00Z", to: "2026-10-17T00:00:00Z" });
    expect(dhaka.data.daily.find((d) => d.revenue > 0).date).toBe("2026-10-16");
  });

  it("sends a complete series, with quiet days as zeroes", async () => {
    await Settings.create({ general: { timezone: "Asia/Dhaka" } });
    await order("2026-10-12T06:00:00Z", { total: 500 });

    const res = await stats({ from: "2026-10-10T00:00:00Z", to: "2026-10-14T06:00:00Z" });

    // The browser rebuilding this list from its own clock is exactly how
    // the labels drifted away from the bars.
    expect(res.data.daily.length).toBeGreaterThanOrEqual(5);
    expect(res.data.daily.every((d) => typeof d.revenue === "number")).toBe(true);
    expect(res.data.daily.every((d) => d.label)).toBe(true);
    expect(res.data.daily.filter((d) => d.revenue === 0).length).toBeGreaterThan(0);
  });
});

describe("comparing with the period before", () => {
  it("measures against the same length of time immediately before", async () => {
    await Settings.create({});
    await order("2026-10-01T06:00:00Z", { total: 1000 }); // previous 10 days
    await order("2026-10-15T06:00:00Z", { total: 1500 }); // this 10 days
    await order("2026-10-16T06:00:00Z", { total: 500 });

    const res = await stats({ from: "2026-10-11T00:00:00Z", to: "2026-10-20T23:59:59Z" });

    expect(res.data.revenue).toBe(2000);
    expect(res.data.previous.revenue).toBe(1000);
    expect(res.data.change.revenue).toBe(100); // doubled
    expect(res.data.change.orders).toBe(100);
  });

  it("says nothing rather than inventing a percentage from zero", async () => {
    await Settings.create({});
    await order("2026-10-15T06:00:00Z", { total: 1500 });

    const res = await stats({ from: "2026-10-11T00:00:00Z", to: "2026-10-20T23:59:59Z" });

    // "up 100%" from a period with no orders at all is not a fact.
    expect(res.data.change.revenue).toBeNull();
    expect(res.data.previous.revenue).toBe(0);
  });

  it("reports a fall as a fall", async () => {
    await Settings.create({});
    await order("2026-10-01T06:00:00Z", { total: 1000 });
    await order("2026-10-15T06:00:00Z", { total: 250 });

    const res = await stats({ from: "2026-10-11T00:00:00Z", to: "2026-10-20T23:59:59Z" });
    expect(res.data.change.revenue).toBe(-75);
  });
});

describe("new customers and returning ones", () => {
  it("counts a buyer as returning only if they bought before this period", async () => {
    await Settings.create({});
    const loyal = await User.create({ name: "Loyal", email: `l${++n}@x.com`, password: "x".repeat(20) });
    const fresh = await User.create({ name: "Fresh", email: `f${++n}@x.com`, password: "x".repeat(20) });

    await order("2026-09-01T06:00:00Z", { user: loyal._id }); // long before
    await order("2026-10-15T06:00:00Z", { user: loyal._id }); // in range
    await order("2026-10-16T06:00:00Z", { user: fresh._id }); // first ever

    const res = await stats({ from: "2026-10-11T00:00:00Z", to: "2026-10-20T23:59:59Z" });

    expect(res.data.buyers).toEqual({ new: 1, returning: 1 });
  });

  it("does not count one person's two orders as two customers", async () => {
    await Settings.create({});
    const buyer = await User.create({ name: "Twice", email: `t${++n}@x.com`, password: "x".repeat(20) });
    await order("2026-10-15T06:00:00Z", { user: buyer._id });
    await order("2026-10-16T06:00:00Z", { user: buyer._id });

    const res = await stats({ from: "2026-10-11T00:00:00Z", to: "2026-10-20T23:59:59Z" });
    expect(res.data.buyers).toEqual({ new: 1, returning: 0 });
  });

  it("recognises a guest coming back by their email", async () => {
    await Settings.create({});
    await order("2026-09-01T06:00:00Z", { guestEmail: "guest@x.com" });
    await order("2026-10-15T06:00:00Z", { guestEmail: "guest@x.com" });

    const res = await stats({ from: "2026-10-11T00:00:00Z", to: "2026-10-20T23:59:59Z" });
    expect(res.data.buyers).toEqual({ new: 0, returning: 1 });
  });
});

describe("who may read the figures", () => {
  it("refuses a customer", async () => {
    mockSession = { user: { id: "000000000000000000000002", role: "customer" } };
    const res = await GET(new Request("http://localhost/api/admin/stats"));
    expect(res.status).toBe(403);
  });

  it("refuses a stranger", async () => {
    mockSession = null;
    const res = await GET(new Request("http://localhost/api/admin/stats"));
    expect(res.status).toBe(403);
  });
});
