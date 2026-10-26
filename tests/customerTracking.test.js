// tests/customerTracking.test.js
//
// The connection between the admin creating a shipment and the customer
// being able to see it.
//
// This existed in neither direction before: the admin's "Create shipment"
// wrote to `fulfillments[]`, while the public /track page and the profile
// read only the older singular `shipment` field. Staff filled in a carrier
// and a tracking number, watched the admin page update — and the customer's
// tracking page stayed empty. These tests are the wire between the two.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import ShippingCarrier from "@/models/ShippingCarrier";
import User from "@/models/User";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => false) }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => "1.1.1.1"),
}));

const trackRoute = await import("@/app/api/track/route");
const { customerTracking, trackingUrlFor } = await import("@/lib/customerTracking");

const track = (body) =>
  trackRoute.POST(
    new Request("http://x/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

let buyer, carrier, mugId, penId;
// reset per test so every order is SM-T700 and the lookups below are literal
let n = 700;

const PHONE = "01711223344";

const makeOrder = (over = {}) =>
  Order.create({
    orderNumber: `SM-T${n++}`,
    user: buyer._id,
    items: [
      { product: mugId, name: "Mug", price: 450, quantity: 1 },
      { product: penId, name: "Pen", price: 50, quantity: 2 },
    ],
    shippingAddress: { fullName: "Sumon", phone: PHONE, address: "Road 1", city: "Savar" },
    paymentMethod: "cod",
    totalAmount: 610,
    orderStatus: "processing",
    ...over,
  });

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  n = 700;
  mugId = new mongoose.Types.ObjectId();
  penId = new mongoose.Types.ObjectId();
  buyer = await User.create({ name: "Sumon", email: "s@test.com", password: "x".repeat(20) });
  carrier = await ShippingCarrier.create({
    name: "Steadfast Courier",
    trackingUrlTemplate: "https://steadfast.com.bd/t/{tracking_number}",
  });
});

describe("a shipment the admin created reaches the customer", () => {
  it("shows the carrier, tracking number and timeline the admin entered", async () => {
    await makeOrder({
      fulfillments: [
        {
          items: [{ product: mugId, name: "Mug", quantity: 1 }],
          carrier: carrier._id,
          trackingNumber: "ST-REAL-1",
          status: "shipped",
          timeline: [{ status: "shipped", note: "Shipment created", at: new Date() }],
        },
      ],
    });

    const res = await track({ orderNumber: "SM-T700", phone: PHONE });
    const { data } = await res.json();

    expect(data.shipments).toHaveLength(1);
    expect(data.shipments[0].trackingNumber).toBe("ST-REAL-1");
    expect(data.shipments[0].carrierName).toBe("Steadfast Courier");
    expect(data.shipments[0].status).toBe("shipped");
    expect(data.shipments[0].timeline).toHaveLength(1);
  });

  it("builds a working link to the carrier's own tracking page", async () => {
    await makeOrder({
      fulfillments: [
        { items: [{ product: mugId, name: "Mug", quantity: 1 }], carrier: carrier._id, trackingNumber: "ST REAL/2" },
      ],
    });
    const { data } = await (await track({ orderNumber: "SM-T700", phone: PHONE })).json();
    // the number is escaped, so a tracking code with a slash doesn't break the URL
    expect(data.shipments[0].trackingUrl).toBe("https://steadfast.com.bd/t/ST%20REAL%2F2");
  });

  it("accepts either placeholder spelling a carrier was configured with", () => {
    expect(trackingUrlFor({ trackingUrlTemplate: "https://c.com/{tracking}" }, "A1")).toBe("https://c.com/A1");
    expect(trackingUrlFor({ trackingUrlTemplate: "https://c.com/{tracking_number}" }, "A1")).toBe("https://c.com/A1");
    // no template means no link, rather than a dead one
    expect(trackingUrlFor({}, "A1")).toBe("");
  });
});

describe("an order that ships in parts", () => {
  it("lists every parcel and what is still to come", async () => {
    await makeOrder({
      fulfillments: [
        {
          items: [{ product: mugId, name: "Mug", quantity: 1 }],
          carrier: carrier._id,
          trackingNumber: "BOX-1",
          status: "delivered",
          timeline: [{ status: "delivered", at: new Date() }],
        },
        {
          items: [{ product: penId, name: "Pen", quantity: 1 }],
          carrier: carrier._id,
          trackingNumber: "BOX-2",
          status: "in_transit",
          timeline: [{ status: "in_transit", at: new Date() }],
        },
      ],
    });

    const { data } = await (await track({ orderNumber: "SM-T700", phone: PHONE })).json();
    expect(data.shipments.map((s) => s.trackingNumber)).toEqual(["BOX-1", "BOX-2"]);
    // one pen of the two hasn't been put in a box yet
    expect(data.awaitingShipment).toEqual([{ name: "Pen", quantity: 1 }]);
  });

  it("is not 'delivered' while a parcel is still in transit", () => {
    const tracking = customerTracking({
      items: [],
      fulfillments: [
        { _id: "a", status: "delivered", items: [], timeline: [] },
        { _id: "b", status: "in_transit", items: [], timeline: [] },
      ],
    });
    expect(tracking.overall).toBe("in_transit");
  });

  it("headlines a failed parcel even when the others are fine", () => {
    const tracking = customerTracking({
      items: [],
      fulfillments: [
        { _id: "a", status: "delivered", items: [], timeline: [] },
        { _id: "b", status: "failed", items: [], timeline: [] },
      ],
    });
    expect(tracking.overall).toBe("failed");
  });
});

describe("what the customer is not shown", () => {
  it("keeps the staff note on a shipment out of the response", async () => {
    await makeOrder({
      fulfillments: [
        {
          items: [{ product: mugId, name: "Mug", quantity: 1 }],
          carrier: carrier._id,
          trackingNumber: "ST-1",
          // staff-facing: a reminder for the packer, not a message to the buyer
          notes: "Replacement for a broken one — do not charge again",
        },
      ],
    });
    const body = await (await track({ orderNumber: "SM-T700", phone: PHONE })).text();
    expect(body).not.toMatch(/do not charge again/i);
  });

  it("gives out no carrier contact details", async () => {
    await ShippingCarrier.findByIdAndUpdate(carrier._id, {
      phone: "01999999999",
      contactPerson: "Rider Manager",
      notes: "Rate negotiated at 60tk",
    });
    await makeOrder({
      fulfillments: [{ items: [{ product: mugId, name: "Mug", quantity: 1 }], carrier: carrier._id, trackingNumber: "ST-1" }],
    });
    const body = await (await track({ orderNumber: "SM-T700", phone: PHONE })).text();
    expect(body).not.toMatch(/01999999999|Rider Manager|negotiated/);
  });

  it("still refuses the whole order to a wrong phone number", async () => {
    await makeOrder({
      fulfillments: [{ items: [{ product: mugId, name: "Mug", quantity: 1 }], carrier: carrier._id, trackingNumber: "ST-1" }],
    });
    const res = await track({ orderNumber: "SM-T700", phone: "01700000000" });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/ST-1/);
  });
});

describe("orders from before fulfillments existed", () => {
  it("still shows the parcel recorded on the old singular field", async () => {
    await makeOrder({
      fulfillments: [],
      shipment: {
        carrier: carrier._id,
        trackingNumber: "OLD-1",
        timeline: [{ status: "in_transit", at: new Date() }],
      },
    });
    const { data } = await (await track({ orderNumber: "SM-T700", phone: PHONE })).json();
    expect(data.shipments).toHaveLength(1);
    expect(data.shipments[0].trackingNumber).toBe("OLD-1");
    expect(data.shipments[0].status).toBe("in_transit");
  });

  it("reports no shipments at all for an order nothing has been done to", async () => {
    await makeOrder();
    const { data } = await (await track({ orderNumber: "SM-T700", phone: PHONE })).json();
    expect(data.shipments).toEqual([]);
    expect(data.awaitingShipment).toEqual([]);
  });
});
