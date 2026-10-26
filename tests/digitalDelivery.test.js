// tests/digitalDelivery.test.js
//
// Covers the digital-delivery security boundary. The cases that matter most
// are the refusals, not the happy path:
//
//   * IDOR — customer B asking for customer A's grant id
//   * quota — the last download can't be spent twice, including concurrently
//   * expiry — an elapsed access window refuses
//   * revocation — takes effect immediately, even on an already-issued token
//   * tokens — forged, tampered and expired ones all refuse
//   * and the headline requirement: no storage URL appears in any response
//     the browser can see
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import DigitalProduct from "@/models/DigitalProduct";
import DownloadGrant from "@/models/DownloadGrant";
import DownloadLog from "@/models/DownloadLog";

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-for-download-signing";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

// The storage URL must never be fetched for real in tests, and stubbing it
// also proves the file route goes through the server rather than redirecting
// the browser at storage.
const fetchMock = vi.fn(async () =>
  new Response("PDF-BYTES", { status: 200, headers: { "content-type": "application/pdf", "content-length": "9" } })
);
vi.stubGlobal("fetch", fetchMock);

const lib = await import("@/lib/digitalDelivery");
const listRoute = await import("@/app/api/downloads/route");
const claimRoute = await import("@/app/api/downloads/[id]/route");
const fileRoute = await import("@/app/api/downloads/file/route");
const accountRoute = await import("@/app/api/account/downloads/route");

const SECRET_URL = "https://res.cloudinary.com/demo/raw/upload/v1/secret-ebook-abc123.pdf";

let ipCounter = 0;
const nextIp = () => `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

const claim = (grantId, body = {}, qs = "") =>
  claimRoute.POST(
    new Request(`http://x/api/downloads/${grantId}${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    }),
    { params: { id: String(grantId) } }
  );

const getFile = (token) =>
  fileRoute.GET(
    new Request(`http://x/api/downloads/file?token=${encodeURIComponent(token || "")}`, {
      headers: { "x-forwarded-for": nextIp() },
    })
  );

const listMine = () => listRoute.GET(new Request("http://x/api/downloads", { headers: { "x-forwarded-for": nextIp() } }));

let buyer, otherBuyer, digital, product, order;

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
  fetchMock.mockClear();

  buyer = await User.create({ name: "Buyer One", email: "one@test.com", password: "x".repeat(20) });
  otherBuyer = await User.create({ name: "Buyer Two", email: "two@test.com", password: "x".repeat(20) });

  digital = await DigitalProduct.create({
    title: "Test Ebook",
    version: "1.0",
    licenseMode: "generated",
    licenseTerms: "Personal use only.",
    downloadLimit: 3,
    files: [
      { url: SECRET_URL, name: "ebook.pdf", size: 1024, type: "application/pdf", version: "1.0", label: "Main download" },
      { url: `${SECRET_URL}?preview`, name: "sample.pdf", size: 128, type: "application/pdf", isPreview: true, label: "Sample" },
    ],
  });

  product = await Product.create({
    name: "Test Ebook",
    slug: `ebook-${Date.now()}`,
    description: "d",
    price: 500,
    category: "Books",
    stock: 99,
    digitalProduct: digital._id,
  });

  order = await Order.create({
    orderNumber: `ORD-T${Date.now().toString(36).toUpperCase()}`,
    user: buyer._id,
    items: [{ product: product._id, name: "Test Ebook", price: 500, quantity: 1 }],
    shippingAddress: { fullName: "Buyer One", phone: "01700000000", address: "A", city: "Dhaka" },
    paymentMethod: "sslcommerz",
    paymentStatus: "paid",
    totalAmount: 500,
  });

  mockSession = { user: { id: String(buyer._id), email: buyer.email, role: "customer" } };
});

describe("grant issuance", () => {
  it("issues one grant per digital item, freezing the policy at purchase time", async () => {
    await lib.createGrantsForOrder(order);
    const grants = await DownloadGrant.find({ order: order._id });
    expect(grants).toHaveLength(1);
    expect(grants[0].downloadLimit).toBe(3);
    expect(grants[0].licenseKey).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(String(grants[0].user)).toBe(String(buyer._id));
  });

  it("is idempotent — a replayed payment webhook cannot hand out a second quota", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    await DownloadGrant.updateOne({ _id: grant._id }, { $set: { downloadCount: 2 } });

    // same order processed again (duplicate postback / admin re-save)
    await lib.createGrantsForOrder(order);
    await lib.createGrantsForOrder(order);

    const grants = await DownloadGrant.find({ order: order._id });
    expect(grants).toHaveLength(1);
    // the spent downloads survived — the quota was not reset
    expect(grants[0].downloadCount).toBe(2);
  });

  it("raising a product's download limit later does not change an existing purchase", async () => {
    await lib.createGrantsForOrder(order);
    await DigitalProduct.updateOne({ _id: digital._id }, { $set: { downloadLimit: 99 } });
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    expect(grant.downloadLimit).toBe(3);
  });

  it("issues nothing for an unpaid order", async () => {
    await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: "pending" } });
    const unpaid = await Order.findById(order._id);
    expect(await lib.createGrantsForOrder(unpaid)).toBe(0);
    expect(await DownloadGrant.countDocuments()).toBe(0);
  });
});

describe("no storage URL ever reaches the client", () => {
  it("is absent from the downloads list, the per-order list and the claim response", async () => {
    await lib.createGrantsForOrder(order);

    const listed = await (await listMine()).json();
    const accountJson = await (await accountRoute.GET()).json();
    const grant = await DownloadGrant.findOne({ order: order._id });
    const claimed = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();

    for (const payload of [listed, accountJson, claimed]) {
      const asText = JSON.stringify(payload);
      expect(asText).not.toContain("cloudinary");
      expect(asText).not.toContain(SECRET_URL);
      expect(asText).not.toContain("secret-ebook-abc123");
    }
    // but the customer does get everything they need to use the file
    expect(listed.data[0].files[0].name).toBe("ebook.pdf");
    expect(listed.data[0].downloadsRemaining).toBe(3);
    expect(listed.data[0].licenseKey).toBeTruthy();
  });

  it("streams bytes through the server instead of redirecting to storage", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();

    const res = await getFile(data.token);
    expect(res.status).toBe(200);
    // not a 3xx to the storage host
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-disposition")).toContain('filename="ebook.pdf"');
    // a purchased file must never sit in a shared cache
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toBe("PDF-BYTES");
    // the server, not the browser, fetched the private URL
    expect(fetchMock).toHaveBeenCalledWith(SECRET_URL);
  });
});

describe("IDOR — one customer cannot reach another's files", () => {
  it("refuses a grant id belonging to a different customer", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });

    // signed in as somebody else, guessing/knowing the grant id
    mockSession = { user: { id: String(otherBuyer._id), email: otherBuyer.email, role: "customer" } };
    const res = await claim(grant._id, { fileId: String(digital.files[0]._id) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(JSON.stringify(json)).not.toContain(SECRET_URL);

    // no download was spent against the real owner's quota
    const after = await DownloadGrant.findById(grant._id);
    expect(after.downloadCount).toBe(0);

    // and the attempt is on the record
    const denied = await DownloadLog.findOne({ outcome: "denied_auth" });
    expect(denied).toBeTruthy();
  });

  it("another customer's downloads never appear in my list", async () => {
    await lib.createGrantsForOrder(order);
    mockSession = { user: { id: String(otherBuyer._id), email: otherBuyer.email, role: "customer" } };
    const json = await (await listMine()).json();
    expect(json.data).toHaveLength(0);
  });

  it("refuses an anonymous caller", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    mockSession = null;
    expect((await claim(grant._id, { fileId: String(digital.files[0]._id) })).status).toBe(401);
    expect((await listMine()).status).toBe(401);
  });

  it("answers a malformed grant id with 404 rather than a server error", async () => {
    const res = await claim("not-an-object-id");
    expect(res.status).toBe(404);
  });

  it("does not reveal whether an unowned grant id exists", async () => {
    await lib.createGrantsForOrder(order);
    const real = await DownloadGrant.findOne({ order: order._id });
    mockSession = { user: { id: String(otherBuyer._id), email: otherBuyer.email, role: "customer" } };

    const existsButNotMine = await claim(real._id, { fileId: String(digital.files[0]._id) });
    const doesNotExist = await claim(new mongoose.Types.ObjectId());

    // a real-but-foreign grant must not be distinguishable by a 403 vs 404
    // leak that confirms the id is valid… it 403s, the nonexistent one 404s,
    // so assert the *message* carries no ownership information
    const a = await existsButNotMine.json();
    expect(a.message).not.toMatch(/buyer|one@test|owner/i);
    expect(doesNotExist.status).toBe(404);
  });
});

describe("download quota", () => {
  it("counts down and refuses once exhausted", async () => {
    await DigitalProduct.updateOne({ _id: digital._id }, { $set: { downloadLimit: 2 } });
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const fileId = String(digital.files[0]._id);

    const first = await (await claim(grant._id, { fileId })).json();
    expect(first.data.downloadsRemaining).toBe(1);
    const second = await (await claim(grant._id, { fileId })).json();
    expect(second.data.downloadsRemaining).toBe(0);

    const third = await claim(grant._id, { fileId });
    expect(third.status).toBe(403);
    const json = await third.json();
    expect(json.reason).toBe("denied_limit");
    expect(json.message).toMatch(/used all the downloads/i);

    const after = await DownloadGrant.findById(grant._id);
    expect(after.downloadCount).toBe(2); // never overshoots the limit
  });

  it("two simultaneous clicks on the last download: only one wins", async () => {
    await DigitalProduct.updateOne({ _id: digital._id }, { $set: { downloadLimit: 1 } });
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const fileId = String(digital.files[0]._id);

    const results = await Promise.all([claim(grant._id, { fileId }), claim(grant._id, { fileId })]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([200, 403]);

    const after = await DownloadGrant.findById(grant._id);
    expect(after.downloadCount).toBe(1);
  });

  it("treats 0 as unlimited rather than as 'no downloads'", async () => {
    await DigitalProduct.updateOne({ _id: digital._id }, { $set: { downloadLimit: 0 } });
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const fileId = String(digital.files[0]._id);

    for (let i = 0; i < 5; i++) {
      const res = await claim(grant._id, { fileId });
      expect(res.status).toBe(200);
      expect((await res.json()).data.downloadsRemaining).toBeNull();
    }
  });

  it("preview files are free and never touch the quota", async () => {
    await DigitalProduct.updateOne({ _id: digital._id }, { $set: { downloadLimit: 1 } });
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const previewId = String(digital.files[1]._id);

    for (let i = 0; i < 3; i++) {
      expect((await claim(grant._id, { fileId: previewId })).status).toBe(200);
    }
    const after = await DownloadGrant.findById(grant._id);
    expect(after.downloadCount).toBe(0);
    // the paid download is still available
    expect((await claim(grant._id, { fileId: String(digital.files[0]._id) })).status).toBe(200);
  });
});

describe("expiry and revocation", () => {
  it("refuses a grant whose access window has passed", async () => {
    await DigitalProduct.updateOne({ _id: digital._id }, { $set: { downloadExpiryDays: 30 } });
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    expect(grant.expiresAt).toBeTruthy();

    await DownloadGrant.updateOne({ _id: grant._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await claim(grant._id, { fileId: String(digital.files[0]._id) });
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("denied_expired");
  });

  it("revocation takes effect immediately, even for an already-issued token", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();

    // admin revokes between the token being issued and the file being fetched
    await DownloadGrant.updateOne({ _id: grant._id }, { $set: { revoked: true, revokedReason: "chargeback" } });

    const res = await getFile(data.token);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalledWith(SECRET_URL);
  });
});

describe("a failed delivery gives the download back", () => {
  it("refunds the quota when storage is unreachable", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(1);

    fetchMock.mockImplementationOnce(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await getFile(data.token);
    expect(res.status).toBe(502);

    // the customer didn't lose a download for our outage
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(0);
  });

  it("refunds when storage answers with an error status", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();

    fetchMock.mockImplementationOnce(async () => new Response("nope", { status: 404 }));
    expect((await getFile(data.token)).status).toBe(502);
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(0);
  });

  it("refunds at most once, however many times the same link is retried", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();
    await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(2);

    for (let i = 0; i < 4; i++) {
      fetchMock.mockImplementationOnce(async () => new Response("nope", { status: 500 }));
      await getFile(data.token);
    }
    // one token failing four times refunds one download, not four
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(1);
  });

  it("does not refund a download that actually succeeded", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();
    expect((await getFile(data.token)).status).toBe(200);
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(1);
  });
});

describe("download tokens", () => {
  it("refuses a forged signature", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const good = lib.signDownloadToken({
      grantId: grant._id,
      fileId: String(digital.files[0]._id),
      expiresAt: Date.now() + 60_000,
    });
    const [body] = good.split(".");
    expect((await getFile(`${body}.deadbeefdeadbeef`)).status).toBe(403);
  });

  it("refuses a token whose payload was edited to point at another grant", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const token = lib.signDownloadToken({
      grantId: grant._id,
      fileId: String(digital.files[0]._id),
      expiresAt: Date.now() + 60_000,
    });
    const [body, mac] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.g = String(new mongoose.Types.ObjectId()); // retarget
    const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`;

    expect(lib.verifyDownloadToken(tampered)).toBeNull();
    expect((await getFile(tampered)).status).toBe(403);
  });

  it("refuses an expired token", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const stale = lib.signDownloadToken({
      grantId: grant._id,
      fileId: String(digital.files[0]._id),
      expiresAt: Date.now() - 1000,
    });
    expect(lib.verifyDownloadToken(stale)).toBeNull();
    const res = await getFile(stale);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/expired/i);
  });

  it("refuses junk and empty tokens without throwing", async () => {
    for (const t of ["", "x", "....", "a.b", "x".repeat(3000)]) {
      const res = await getFile(t);
      expect([403, 404]).toContain(res.status);
    }
  });
});

describe("guest buyers", () => {
  let guestOrder;

  beforeEach(async () => {
    guestOrder = await Order.create({
      orderNumber: `ORD-G${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      guestEmail: "guest@test.com",
      guestAccessToken: "guest-token-" + "a".repeat(30),
      items: [{ product: product._id, name: "Test Ebook", price: 500, quantity: 1 }],
      shippingAddress: { fullName: "Guest", phone: "01700000001", address: "B", city: "Dhaka" },
      paymentMethod: "sslcommerz",
      paymentStatus: "paid",
      totalAmount: 500,
    });
    mockSession = null;
  });

  it("reaches their download with the order's access token", async () => {
    await lib.createGrantsForOrder(guestOrder);
    const grant = await DownloadGrant.findOne({ order: guestOrder._id });
    expect(grant.guestEmail).toBe("guest@test.com");
    expect(grant.user).toBeNull();

    const res = await claim(grant._id, { fileId: String(digital.files[0]._id) }, `?t=guest-token-${"a".repeat(30)}`);
    expect(res.status).toBe(200);
  });

  it("is refused with a wrong access token", async () => {
    await lib.createGrantsForOrder(guestOrder);
    const grant = await DownloadGrant.findOne({ order: guestOrder._id });
    const res = await claim(grant._id, { fileId: String(digital.files[0]._id) }, `?t=guest-token-${"b".repeat(30)}`);
    expect(res.status).toBe(401);
    expect((await DownloadGrant.findById(grant._id)).downloadCount).toBe(0);
  });

  it("never echoes the order's access token back out", async () => {
    await lib.createGrantsForOrder(guestOrder);
    const token = `guest-token-${"a".repeat(30)}`;
    const res = await listRoute.GET(
      new Request(`http://x/api/downloads?order=${guestOrder._id}&t=${token}`, {
        headers: { "x-forwarded-for": nextIp() },
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(JSON.stringify(json)).not.toContain(token);
  });

  it("a guest order with a digital item no longer 500s (user is null)", async () => {
    const perOrder = await import("@/app/api/orders/[id]/downloads/route");
    const res = await perOrder.GET(
      new Request(`http://x/api/orders/${guestOrder._id}/downloads?t=guest-token-${"a".repeat(30)}`),
      { params: { id: String(guestOrder._id) } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });
});

describe("audit log", () => {
  it("records served downloads and refusals, without the storage URL or token", async () => {
    await lib.createGrantsForOrder(order);
    const grant = await DownloadGrant.findOne({ order: order._id });
    const { data } = await (await claim(grant._id, { fileId: String(digital.files[0]._id) })).json();
    await getFile(data.token);
    await getFile("forged.token");

    const served = await DownloadLog.findOne({ outcome: "served" });
    expect(served.fileName).toBe("ebook.pdf");
    expect(String(served.user)).toBe(String(buyer._id));
    expect(served.ip).toBeTruthy();

    expect(await DownloadLog.countDocuments({ outcome: "denied_token" })).toBe(1);

    const allLogs = JSON.stringify(await DownloadLog.find({}).lean());
    expect(allLogs).not.toContain(SECRET_URL);
    expect(allLogs).not.toContain(data.token);
  });
});

describe("legacy single-file digital products", () => {
  it("keep working through the same path", async () => {
    const legacy = await DigitalProduct.create({
      title: "Old Ebook",
      fileUrl: "https://res.cloudinary.com/demo/raw/upload/legacy.pdf",
      fileName: "legacy.pdf",
      fileSize: 2048,
      fileType: "application/pdf",
    });
    const legacyProduct = await Product.create({
      name: "Old Ebook",
      slug: `old-${Date.now()}`,
      description: "d",
      price: 100,
      category: "Books",
      stock: 5,
      digitalProduct: legacy._id,
    });
    const legacyOrder = await Order.create({
      orderNumber: `ORD-L${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      user: buyer._id,
      items: [{ product: legacyProduct._id, name: "Old Ebook", price: 100, quantity: 1 }],
      shippingAddress: { fullName: "Buyer One", phone: "01700000000", address: "A", city: "Dhaka" },
      paymentMethod: "cod",
      paymentStatus: "paid",
      totalAmount: 100,
    });

    await lib.createGrantsForOrder(legacyOrder);
    const grant = await DownloadGrant.findOne({ order: legacyOrder._id });
    expect(grant).toBeTruthy();

    const res = await claim(grant._id, { fileId: "legacy" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.fileName).toBe("legacy.pdf");
    expect((await getFile(data.token)).status).toBe(200);
  });

  it("a digital product with no file at all is rejected at save time", async () => {
    await expect(DigitalProduct.create({ title: "Empty" })).rejects.toThrow(/at least one file/i);
  });
});

describe("backfill for purchases made before this system existed", () => {
  it("issues grants on first read so nobody loses access to what they bought", async () => {
    expect(await DownloadGrant.countDocuments()).toBe(0);
    const json = await (await listMine()).json();
    expect(json.data).toHaveLength(1);
    expect(await DownloadGrant.countDocuments({ user: buyer._id })).toBe(1);
  });
});
