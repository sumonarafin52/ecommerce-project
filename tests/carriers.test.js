// tests/carriers.test.js
//
// Courier integrations. Most couriers have no API, so the cases that matter
// are the refusals: a store must never be told a parcel was booked when
// nothing was booked.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import ShippingCarrier from "@/models/ShippingCarrier";
import User from "@/models/User";
import Settings from "@/models/Settings";

process.env.PAYMENT_ENCRYPTION_KEY = process.env.PAYMENT_ENCRYPTION_KEY || "test-key-for-encrypting-credentials";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
let permitted = true;
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => permitted) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const carrierRoute = await import("@/app/api/orders/[id]/carrier/route");
const carrierApiRoute = await import("@/app/api/shipping/carriers/[id]/api/route");
const { getCarrierAdapter, listCarrierProviders, adapterForCarrier } = await import("@/lib/carriers");
const { codAmountFor, mapStatus, recipientFrom, timelineStatusFor, SHIPMENT_STATUSES } = await import(
  "@/lib/carriers/adapter"
);
const { encryptSecret } = await import("@/lib/crypto");

const act = (orderId, body) =>
  carrierRoute.POST(
    new Request(`http://x/api/orders/${orderId}/carrier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id: String(orderId) } }
  );

let order, manualCarrier, apiCarrier, buyer;
let n = 300;

const productId = () => new mongoose.Types.ObjectId();

/**
 * An order with one parcel already created, since booking acts on a
 * fulfillment — that's where the admin's "Create shipment" puts a parcel,
 * and an order can have several.
 */
const makeOrder = (over = {}) => {
  const product = over.productId || productId();
  return Order.create({
    orderNumber: `SM-C${n++}`,
    user: buyer._id,
    items: [{ product, name: "Mug", price: 450, quantity: 1 }],
    fulfillments: [{ items: [{ product, name: "Mug", quantity: 1 }] }],
    shippingAddress: { fullName: "Sumon", phone: "01711223344", address: "Road 1", city: "Savar", country: "Bangladesh" },
    paymentMethod: "cod",
    paymentStatus: "pending",
    totalAmount: 510,
    ...over,
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
  fetchMock.mockReset();
  permitted = true;
  mockSession = { user: { id: String(new mongoose.Types.ObjectId()), name: "Admin", role: "admin" } };

  buyer = await User.create({ name: "Sumon", email: "s@test.com", password: "x".repeat(20) });
  await Settings.create({ general: { storeName: "Shop" } });

  manualCarrier = await ShippingCarrier.create({ name: "Local Rider", active: true });
  apiCarrier = await ShippingCarrier.create({
    name: "Steadfast",
    active: true,
    api: {
      connected: true,
      provider: "steadfast",
      credentials: { apiKey: "key-123", secretKey: encryptSecret("secret-456") },
    },
  });

  order = await makeOrder();
});

describe("the registry", () => {
  it("offers manual as a real option, not a gap", () => {
    const providers = listCarrierProviders();
    const manual = providers.find((p) => p.id === "manual");
    expect(manual).toBeTruthy();
    expect(manual.capabilities.booking).toBe(false);
  });

  it("marks an integration that was never run against a live account", () => {
    const steadfast = listCarrierProviders().find((p) => p.id === "steadfast");
    expect(steadfast.verified).toBe(false);
    expect(steadfast.capabilities.booking).toBe(true);
  });

  it("falls back to manual for an unknown provider rather than crashing", () => {
    expect(getCarrierAdapter("some-courier-that-doesnt-exist").id).toBe("manual");
    expect(getCarrierAdapter(undefined).id).toBe("manual");
  });

  it("falls back to manual when the integration is switched off", () => {
    const { adapter } = adapterForCarrier({ api: { connected: false, provider: "steadfast" } });
    expect(adapter.id).toBe("manual");
  });

  it("decrypts stored secrets and leaves plain fields alone", () => {
    const { adapter, credentials } = adapterForCarrier(apiCarrier.toObject());
    expect(adapter.id).toBe("steadfast");
    expect(credentials.apiKey).toBe("key-123");
    expect(credentials.secretKey).toBe("secret-456");
  });
});

describe("what a courier is told", () => {
  it("asks for no COD on an order that's already paid", () => {
    // Sending the order total as COD on a prepaid order has the rider
    // collect money the customer has already handed over.
    expect(codAmountFor({ paymentStatus: "paid", totalAmount: 510 })).toBe(0);
    expect(codAmountFor({ paymentStatus: "pending", totalAmount: 510 })).toBe(510);
  });

  it("builds a single address line from the parts", () => {
    const to = recipientFrom({
      shippingAddress: { fullName: "A", phone: "017", address: "Road 1", city: "Savar", state: "Dhaka", postalCode: "1340" },
    });
    expect(to.address).toBe("Road 1, Savar, Dhaka, 1340");
    expect(to.phone).toBe("017");
  });

  // Couriers and customers use different words for the same parcel, and the
  // timeline is schema-validated. Before this check existed, every booking
  // saved `status: "pending"` into a timeline whose enum has no such value,
  // so every single booking failed with a 500 after the courier had already
  // created the parcel. Any new courier status needs a timeline equivalent.
  it("gives every courier status a word the customer timeline accepts", () => {
    const allowed = Order.schema.path("fulfillments").schema.path("timeline").schema.path("status").enumValues;
    for (const status of SHIPMENT_STATUSES) {
      const equivalent = timelineStatusFor(status);
      expect(equivalent, `no timeline equivalent for courier status "${status}"`).toBeTruthy();
      expect(allowed, `timeline rejects "${equivalent}" (from "${status}")`).toContain(equivalent);
    }
  });

  it("leaves an unrecognised courier status unmapped rather than guessing", () => {
    expect(mapStatus("delivered")).toBe("delivered");
    expect(mapStatus("in review", { in_review: "pending" })).toBe("pending");
    // a wrong status on a customer's tracking page is worse than none
    expect(mapStatus("schrodinger")).toBeNull();
  });
});

describe("booking", () => {
  beforeEach(async () => {
    order.fulfillments[0].carrier = apiCarrier._id;
    await order.save();
  });

  it("records the consignment the courier returned", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ consignment: { consignment_id: 998877, tracking_code: "ST-ABC", status: "pending" } }), { status: 200 })
    );

    const res = await act(order._id, { action: "book" });
    expect(res.status).toBe(200);

    const after = await Order.findById(order._id);
    expect(after.fulfillments[0].consignmentId).toBe("998877");
    expect(after.fulfillments[0].trackingNumber).toBe("ST-ABC");
    expect(after.fulfillments[0].bookedWith).toBe("steadfast");
    expect(after.activity.some((a) => a.type === "shipment_created")).toBe(true);
  });

  it("sends the COD amount for an unpaid order and zero for a paid one", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ consignment: { consignment_id: 1, tracking_code: "T1" } }), { status: 200 })
    );
    await act(order._id, { action: "book" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).cod_amount).toBe(510);

    const paid = await makeOrder({ paymentStatus: "paid" });
    paid.fulfillments[0].carrier = apiCarrier._id;
    await paid.save();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ consignment: { consignment_id: 2, tracking_code: "T2" } }), { status: 200 })
    );
    await act(paid._id, { action: "book" });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).cod_amount).toBe(0);
  });

  it("reports the courier's own rejection rather than claiming success", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Invalid recipient phone" }), { status: 422 }));
    const res = await act(order._id, { action: "book" });
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/Invalid recipient phone/);
    // and nothing was recorded as booked
    expect((await Order.findById(order._id)).fulfillments[0].consignmentId).toBe("");
  });

  it("survives the courier being unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));
    const res = await act(order._id, { action: "book" });
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/ETIMEDOUT/);
  });

  it("refuses to book twice — that would create a second parcel", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ consignment: { consignment_id: 5, tracking_code: "T5" } }), { status: 200 })
    );
    await act(order._id, { action: "book" });
    const second = await act(order._id, { action: "book" });
    expect(second.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses for a courier with no API, and says what to do instead", async () => {
    const manualOrder = await makeOrder();
    manualOrder.fulfillments[0].carrier = manualCarrier._id;
    await manualOrder.save();

    const res = await act(manualOrder._id, { action: "book" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/enter the tracking number/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when no carrier has been chosen", async () => {
    const bare = await makeOrder();
    const res = await act(bare._id, { action: "book" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/choose a carrier/i);
  });
});

describe("status refresh", () => {
  beforeEach(async () => {
    order.fulfillments[0].carrier = apiCarrier._id;
    order.fulfillments[0].consignmentId = "998877";
    order.fulfillments[0].trackingNumber = "ST-ABC";
    await order.save();
  });

  it("appends a timeline event and advances the order", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ delivery_status: "delivered" }), { status: 200 }));
    const res = await act(order._id, { action: "refreshStatus" });
    expect(res.status).toBe(200);

    const after = await Order.findById(order._id);
    expect(after.fulfillments[0].timeline.at(-1).status).toBe("delivered");
    expect(after.orderStatus).toBe("delivered");
    expect(after.deliveredAt).toBeTruthy();
  });

  it("says so when the courier's wording isn't one we recognise, and changes nothing", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ delivery_status: "left_with_neighbour" }), { status: 200 }));
    const res = await act(order._id, { action: "refreshStatus" });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.changed).toBe(false);
    expect(json.message).toMatch(/doesn't map/i);
    expect((await Order.findById(order._id)).fulfillments[0].timeline).toHaveLength(0);
  });

  it("reports no change when the status is the same", async () => {
    // A fresh Response per call — a Response body can only be read once, so
    // mockResolvedValue with one instance makes the second call look like a
    // courier outage.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ delivery_status: "in_transit" }), { status: 200 }));
    await act(order._id, { action: "refreshStatus" });
    const second = await act(order._id, { action: "refreshStatus" });
    const json = await second.json();
    expect(json.data.changed).toBe(false);
    expect((await Order.findById(order._id)).fulfillments[0].timeline).toHaveLength(1);
  });

  it("refuses for a courier that can't be queried", async () => {
    const manualOrder = await makeOrder();
    manualOrder.fulfillments[0].carrier = manualCarrier._id;
    manualOrder.fulfillments[0].trackingNumber = "HAND-1";
    await manualOrder.save();

    const res = await act(manualOrder._id, { action: "refreshStatus" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/by hand/i);
  });
});

describe("the carrier integration settings", () => {
  const get = (id) => carrierApiRoute.GET(new Request("http://x"), { params: { id: String(id) } });
  const put = (id, body) =>
    carrierApiRoute.PUT(
      new Request("http://x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      { params: { id: String(id) } }
    );
  const test = (id) => carrierApiRoute.POST(new Request("http://x", { method: "POST" }), { params: { id: String(id) } });

  it("never sends a stored secret back to the browser", async () => {
    const { data } = await (await get(apiCarrier._id)).json();
    expect(data.credentials.secretKey).not.toContain("secret-456");
    expect(JSON.stringify(data)).not.toContain("secret-456");
    // but does say the key is set
    expect(data.credentials.apiKey).toBe("key-123");
  });

  it("keeps the existing secret when the mask is sent back unchanged", async () => {
    const { MASK } = await import("@/lib/paymentGateways");
    await put(apiCarrier._id, { provider: "steadfast", connected: true, credentials: { secretKey: MASK } });
    const { credentials } = adapterForCarrier((await ShippingCarrier.findById(apiCarrier._id)).toObject());
    expect(credentials.secretKey).toBe("secret-456");
  });

  it("stores a new secret encrypted", async () => {
    await put(apiCarrier._id, { provider: "steadfast", connected: true, credentials: { secretKey: "brand-new" } });
    const raw = (await ShippingCarrier.findById(apiCarrier._id)).api.credentials.secretKey;
    expect(raw).not.toBe("brand-new");
    const { credentials } = adapterForCarrier((await ShippingCarrier.findById(apiCarrier._id)).toObject());
    expect(credentials.secretKey).toBe("brand-new");
  });

  it("never marks manual as connected — there's nothing to connect to", async () => {
    await put(apiCarrier._id, { provider: "manual", connected: true });
    expect((await ShippingCarrier.findById(apiCarrier._id)).api.connected).toBe(false);
  });

  it("records what the test said, pass or fail", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 200, current_balance: 1500 }), { status: 200 }));
    const ok = await (await test(apiCarrier._id)).json();
    expect(ok.success).toBe(true);
    expect(ok.message).toMatch(/1500/);
    expect((await ShippingCarrier.findById(apiCarrier._id)).api.lastTestOk).toBe(true);

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
    const bad = await (await test(apiCarrier._id)).json();
    expect(bad.success).toBe(false);
    const after = await ShippingCarrier.findById(apiCarrier._id);
    expect(after.api.lastTestOk).toBe(false);
    expect(after.api.lastTestMessage).toMatch(/Unauthorized/);
  });

  it("stays behind the settings permission", async () => {
    permitted = false;
    expect((await get(apiCarrier._id)).status).toBe(403);
    expect((await put(apiCarrier._id, {})).status).toBe(403);
    expect((await test(apiCarrier._id)).status).toBe(403);
  });
});

describe("permissions on booking", () => {
  it("requires orders_update", async () => {
    permitted = false;
    order.fulfillments[0].carrier = apiCarrier._id;
    await order.save();
    expect((await act(order._id, { action: "book" })).status).toBe(403);
  });

  it("rejects an unknown action and a malformed id", async () => {
    expect((await act(order._id, { action: "explode" })).status).toBe(400);
    expect((await act("not-an-id", { action: "book" })).status).toBe(404);
  });
});
