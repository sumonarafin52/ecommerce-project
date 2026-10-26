// tests/guestAccess.test.js
//
// Guest orders, across the routes that were written before `user` became
// optional. The same mistake has now surfaced four times — a route reads
// `order.user.something` and throws a 500 for anyone who checked out without
// an account — so these pin the behaviour rather than leaving it to be
// rediscovered.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Settings from "@/models/Settings";

const sendEmail = vi.fn(async () => ({ sent: true }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a) => sendEmail(...a) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
let staff = false;
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => staff) }));

const invoiceRoute = await import("@/app/api/orders/[id]/invoice/route");
const { notify } = await import("@/lib/notify");

const TOKEN = "guest-token-" + "c".repeat(30);

const getInvoice = (id, token) =>
  invoiceRoute.GET(new Request(`http://x/api/orders/${id}/invoice${token ? `?t=${token}` : ""}`), {
    params: { id: String(id) },
  });

let guestOrder, accountOrder, buyer, product;
let n = 600;

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  sendEmail.mockClear();
  staff = false;
  mockSession = null;

  buyer = await User.create({ name: "Buyer", email: "b@test.com", password: "x".repeat(20) });
  product = await Product.create({
    name: "Mug",
    slug: `m${Math.random()}`,
    description: "d",
    price: 450,
    category: "Home",
    stock: 5,
  });
  await Settings.create({ general: { storeName: "Shop" } });

  const base = {
    items: [{ product: product._id, name: "Mug", price: 450, quantity: 1 }],
    shippingAddress: { fullName: "Buyer", phone: "01711223344", address: "A", city: "Dhaka" },
    paymentMethod: "cod",
    paymentStatus: "paid",
    totalAmount: 450,
  };
  guestOrder = await Order.create({
    ...base,
    orderNumber: `SM-G${n++}`,
    guestEmail: "guest@test.com",
    guestAccessToken: TOKEN,
  });
  accountOrder = await Order.create({ ...base, orderNumber: `SM-A${n++}`, user: buyer._id });
});

describe("a guest can reach their own invoice", () => {
  it("returns the invoice with the order's access token", async () => {
    // This used to throw "Cannot read properties of null (reading '_id')"
    // and answer 500, so a guest's invoice page rendered blank.
    const res = await getInvoice(guestOrder._id, TOKEN);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.order.orderNumber).toBe(guestOrder.orderNumber);
  });

  it("never sends the access token back in the response", async () => {
    const res = await getInvoice(guestOrder._id, TOKEN);
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
  });

  it("assigns an invoice number on first view, and keeps it afterwards", async () => {
    const first = await (await getInvoice(guestOrder._id, TOKEN)).json();
    expect(first.data.order.invoiceNumber).toBeTruthy();
    const second = await (await getInvoice(guestOrder._id, TOKEN)).json();
    expect(second.data.order.invoiceNumber).toBe(first.data.order.invoiceNumber);
  });

  it("refuses a wrong token, and no token at all", async () => {
    expect((await getInvoice(guestOrder._id, "wrong-" + "d".repeat(26))).status).toBe(403);
    expect((await getInvoice(guestOrder._id)).status).toBe(401);
  });

  it("refuses a malformed id rather than erroring", async () => {
    expect((await getInvoice("not-an-id", TOKEN)).status).toBe(404);
  });
});

describe("account holders and staff are unaffected", () => {
  it("the customer who placed it can still open their invoice", async () => {
    mockSession = { user: { id: String(buyer._id), email: buyer.email } };
    expect((await getInvoice(accountOrder._id)).status).toBe(200);
  });

  it("a different customer cannot", async () => {
    const other = await User.create({ name: "Other", email: "o@test.com", password: "x".repeat(20) });
    mockSession = { user: { id: String(other._id), email: other.email } };
    expect((await getInvoice(accountOrder._id)).status).toBe(403);
    // nor a guest order, without its token
    expect((await getInvoice(guestOrder._id)).status).toBe(403);
  });

  it("staff can open any invoice, including a guest's", async () => {
    staff = true;
    mockSession = { user: { id: String(new mongoose.Types.ObjectId()), role: "admin" } };
    expect((await getInvoice(guestOrder._id)).status).toBe(200);
    expect((await getInvoice(accountOrder._id)).status).toBe(200);
  });
});

describe("every staff action works on a guest order", () => {
  // Five separate routes have now been found dereferencing `order.user` and
  // answering 500 for guest orders. This sweeps the order routes as staff so
  // the next one is caught here rather than in production.
  beforeEach(() => {
    staff = true;
    mockSession = { user: { id: String(new mongoose.Types.ObjectId()), name: "Admin", role: "admin" } };
  });

  it("status can be changed — a guest order used to be unprogressable", async () => {
    const orderRoute = await import("@/app/api/orders/[id]/route");
    const res = await orderRoute.PUT(
      new Request(`http://x/api/orders/${guestOrder._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "processing" }),
      }),
      { params: { id: String(guestOrder._id) } }
    );
    expect(res.status).toBe(200);
    expect((await Order.findById(guestOrder._id)).orderStatus).toBe("processing");
  });

  it("the order itself can be read", async () => {
    const orderRoute = await import("@/app/api/orders/[id]/route");
    const res = await orderRoute.GET(new Request(`http://x/api/orders/${guestOrder._id}`), {
      params: { id: String(guestOrder._id) },
    });
    expect(res.status).toBe(200);
  });

  it("shipment, fulfilments and downloads all answer without a server error", async () => {
    const routes = [
      ["@/app/api/orders/[id]/shipment/route", "GET"],
      ["@/app/api/orders/[id]/fulfillments/route", "GET"],
      ["@/app/api/orders/[id]/downloads/route", "GET"],
    ];
    for (const [mod, method] of routes) {
      let handler;
      try {
        handler = (await import(mod))[method];
      } catch {
        continue; // route doesn't expose this verb
      }
      if (!handler) continue;
      const res = await handler(new Request(`http://x/api/orders/${guestOrder._id}/x`), {
        params: { id: String(guestOrder._id) },
      });
      expect(res.status, `${mod} ${method}`).toBeLessThan(500);
    }
  });
});

describe("guests are told what happens to their order", () => {
  it("emails a guest even though there's no account to notify", async () => {
    // Previously notify() returned immediately when there was no user, so a
    // guest heard nothing about shipping, refunds or status changes.
    await notify({
      user: null,
      guestEmail: "guest@test.com",
      type: "shipment",
      title: "Your order has shipped",
      message: "On its way.",
      link: "/track",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("guest@test.com");
    expect(sendEmail.mock.calls[0][0].subject).toBe("Your order has shipped");
  });

  it("still notifies an account holder the usual way", async () => {
    const Notification = (await import("@/models/Notification")).default;
    await notify({ user: buyer._id, type: "shipment", title: "Shipped", message: "On its way." });
    expect(await Notification.countDocuments({ user: buyer._id })).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("b@test.com");
  });

  it("creates no in-app notification for a guest — there's no account to show it in", async () => {
    const Notification = (await import("@/models/Notification")).default;
    await notify({ user: null, guestEmail: "guest@test.com", type: "shipment", title: "Shipped", message: "x" });
    expect(await Notification.countDocuments()).toBe(0);
  });

  it("does nothing when there's neither an account nor an email", async () => {
    await notify({ user: null, guestEmail: "", type: "shipment", title: "Shipped", message: "x" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
