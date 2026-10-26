// tests/adminDownloads.test.js
//
// The admin side of digital delivery. The interesting cases are the bounds:
// revoking must take effect for the customer immediately, extending must
// never shorten access, topping up must not rewrite download history, and
// none of it may be reachable without the right permission.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import DownloadGrant from "@/models/DownloadGrant";
import DownloadLog from "@/models/DownloadLog";
import User from "@/models/User";

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-for-admin-downloads";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
let permitted = true;
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => permitted) }));
const notifySpy = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify: (...args) => notifySpy(...args) }));

const listRoute = await import("@/app/api/admin/downloads/route");
const oneRoute = await import("@/app/api/admin/downloads/[id]/route");
const { grantBlockReason } = await import("@/lib/digitalDelivery");

const list = (qs = "") => listRoute.GET(new Request(`http://x/api/admin/downloads${qs}`));
const act = (id, body) =>
  oneRoute.PUT(
    new Request(`http://x/api/admin/downloads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id: String(id) } }
  );
const history = (id) => oneRoute.GET(new Request(`http://x/api/admin/downloads/${id}`), { params: { id: String(id) } });

let buyer, grant;

const makeGrant = (over = {}) =>
  DownloadGrant.create({
    order: new mongoose.Types.ObjectId(),
    orderNumber: "SM-000900",
    product: new mongoose.Types.ObjectId(),
    digitalProduct: new mongoose.Types.ObjectId(),
    user: buyer._id,
    productName: "Test Course",
    downloadLimit: 5,
    downloadCount: 2,
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
  permitted = true;
  notifySpy.mockClear();
  buyer = await User.create({ name: "Rafi Ahmed", email: "rafi@test.com", password: "x".repeat(20) });
  mockSession = { user: { id: String(new mongoose.Types.ObjectId()), role: "admin" } };
  grant = await makeGrant();
});

describe("listing", () => {
  it("returns entitlements with real usage figures", async () => {
    const { data } = await (await list()).json();
    expect(data.total).toBe(1);
    const row = data.grants[0];
    expect(row.customerName).toBe("Rafi Ahmed");
    expect(row.customerEmail).toBe("rafi@test.com");
    expect(row.downloadCount).toBe(2);
    expect(row.downloadsRemaining).toBe(3);
    expect(row.isGuest).toBe(false);
  });

  it("never exposes a storage URL", async () => {
    const body = await (await list()).json();
    expect(JSON.stringify(body)).not.toContain("cloudinary");
    expect(JSON.stringify(body)).not.toContain("http");
  });

  it("searches by customer name, email, product and order number", async () => {
    for (const q of ["Rafi", "rafi@test.com", "Test Course", "SM-000900"]) {
      const { data } = await (await list(`?q=${encodeURIComponent(q)}`)).json();
      expect(data.total, `search for "${q}"`).toBe(1);
    }
    const { data } = await (await list("?q=nobody-at-all")).json();
    expect(data.total).toBe(0);
  });

  it("filters by status, combining the filter with the search instead of dropping one", async () => {
    await makeGrant({ orderNumber: "SM-000901", revoked: true, productName: "Revoked Course" });
    await makeGrant({ orderNumber: "SM-000902", downloadCount: 5, productName: "Finished Course" });
    await makeGrant({
      orderNumber: "SM-000903",
      expiresAt: new Date(Date.now() - 86_400_000),
      productName: "Lapsed Course",
    });

    const counts = {};
    for (const s of ["all", "active", "revoked", "exhausted", "expired"]) {
      counts[s] = (await (await list(`?status=${s}`)).json()).data.total;
    }
    expect(counts.all).toBe(4);
    expect(counts.active).toBe(1);
    expect(counts.revoked).toBe(1);
    expect(counts.exhausted).toBe(1);
    expect(counts.expired).toBe(1);

    // search AND status together — the earlier version let one overwrite the
    // other, so this returned the wrong rows
    const both = await (await list("?status=revoked&q=Revoked")).json();
    expect(both.data.total).toBe(1);
    const mismatched = await (await list("?status=revoked&q=Finished")).json();
    expect(mismatched.data.total).toBe(0);
  });

  it("counts the distinct addresses a purchase has been pulled from", async () => {
    for (const ip of ["1.1.1.1", "2.2.2.2", "2.2.2.2", "3.3.3.3"]) {
      await DownloadLog.create({ grant: grant._id, outcome: "served", ip, at: new Date() });
    }
    // refused attempts aren't evidence of sharing
    await DownloadLog.create({ grant: grant._id, outcome: "denied_limit", ip: "9.9.9.9", at: new Date() });

    const { data } = await (await list()).json();
    expect(data.grants[0].distinctIps).toBe(3);
  });
});

describe("revoke and restore", () => {
  it("revoking blocks the customer immediately and records the reason", async () => {
    const res = await act(grant._id, { action: "revoke", reason: "Chargeback" });
    expect(res.status).toBe(200);

    const after = await DownloadGrant.findById(grant._id).lean();
    expect(after.revoked).toBe(true);
    expect(after.revokedReason).toBe("Chargeback");
    expect(after.revokedAt).toBeTruthy();
    // this is what the customer-facing routes check
    expect(grantBlockReason(after)).toBe("denied_revoked");
  });

  it("tells the customer, and says why", async () => {
    await act(grant._id, { action: "revoke", reason: "Shared publicly" });
    expect(notifySpy).toHaveBeenCalledTimes(1);
    const arg = notifySpy.mock.calls[0][0];
    expect(String(arg.user)).toBe(String(buyer._id));
    expect(arg.message).toMatch(/Shared publicly/);
    expect(arg.link).toBe("/account/downloads");
  });

  it("restoring clears the block without touching what they've used", async () => {
    await act(grant._id, { action: "revoke", reason: "mistake" });
    await act(grant._id, { action: "restore" });

    const after = await DownloadGrant.findById(grant._id).lean();
    expect(after.revoked).toBe(false);
    expect(after.revokedReason).toBe("");
    expect(after.downloadCount).toBe(2); // history intact
    expect(grantBlockReason(after)).toBeNull();
  });
});

describe("extending access", () => {
  it("extends from the existing expiry, so it can never shorten access", async () => {
    const future = new Date(Date.now() + 100 * 86_400_000);
    const g = await makeGrant({ orderNumber: "SM-000910", expiresAt: future });

    await act(g._id, { action: "extend", days: 30 });
    const after = await DownloadGrant.findById(g._id).lean();
    expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(future.getTime());
  });

  it("extends from today when access has already lapsed", async () => {
    const g = await makeGrant({ orderNumber: "SM-000911", expiresAt: new Date(Date.now() - 50 * 86_400_000) });
    await act(g._id, { action: "extend", days: 10 });

    const after = await DownloadGrant.findById(g._id).lean();
    expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(grantBlockReason(after)).toBeNull();
  });

  it("rejects a missing or nonsense number of days", async () => {
    for (const days of [0, -5, "abc", null]) {
      expect((await act(grant._id, { action: "extend", days })).status).toBe(400);
    }
  });

  it("clamps an absurd extension", async () => {
    const g = await makeGrant({ orderNumber: "SM-000912", expiresAt: new Date() });
    await act(g._id, { action: "extend", days: 999999 });
    const after = await DownloadGrant.findById(g._id).lean();
    const years = (new Date(after.expiresAt).getTime() - Date.now()) / (365 * 86_400_000);
    expect(years).toBeLessThan(11);
  });
});

describe("topping up downloads", () => {
  it("raises the ceiling instead of resetting the counter", async () => {
    await act(grant._id, { action: "topUp", downloads: 3 });
    const after = await DownloadGrant.findById(grant._id).lean();
    // the 2 they already used stay used — the history stays truthful
    expect(after.downloadCount).toBe(2);
    expect(after.downloadLimit).toBe(8);
  });

  it("refuses on an already-unlimited purchase rather than silently capping it", async () => {
    const g = await makeGrant({ orderNumber: "SM-000913", downloadLimit: 0 });
    const res = await act(g._id, { action: "topUp", downloads: 5 });
    expect(res.status).toBe(400);
    expect((await DownloadGrant.findById(g._id)).downloadLimit).toBe(0);
  });

  it("rejects zero, negative and non-numeric amounts", async () => {
    for (const downloads of [0, -3, "lots"]) {
      expect((await act(grant._id, { action: "topUp", downloads })).status).toBe(400);
    }
    expect((await DownloadGrant.findById(grant._id)).downloadLimit).toBe(5);
  });
});

describe("history", () => {
  it("returns the download log for one entitlement, newest first", async () => {
    await DownloadLog.create({ grant: grant._id, outcome: "served", ip: "1.1.1.1", at: new Date(Date.now() - 60_000) });
    await DownloadLog.create({ grant: grant._id, outcome: "denied_limit", ip: "1.1.1.1", at: new Date() });
    // another grant's log must not leak into this one
    const other = await makeGrant({ orderNumber: "SM-000920" });
    await DownloadLog.create({ grant: other._id, outcome: "served", ip: "5.5.5.5", at: new Date() });

    const { data } = await (await history(grant._id)).json();
    expect(data).toHaveLength(2);
    expect(data[0].outcome).toBe("denied_limit");
  });
});

describe("guard rails", () => {
  it("rejects an unknown action", async () => {
    const res = await act(grant._id, { action: "deleteEverything" });
    expect(res.status).toBe(400);
  });

  it("answers a malformed id with 404 rather than a server error", async () => {
    expect((await act("not-an-id", { action: "restore" })).status).toBe(404);
    expect((await history("not-an-id")).status).toBe(404);
  });

  it("requires a signed-in session", async () => {
    mockSession = null;
    expect((await list()).status).toBe(401);
    expect((await act(grant._id, { action: "restore" })).status).toBe(401);
    expect((await history(grant._id)).status).toBe(401);
  });

  it("requires the products permission", async () => {
    permitted = false;
    expect((await list()).status).toBe(403);
    expect((await act(grant._id, { action: "revoke" })).status).toBe(403);
    expect((await history(grant._id)).status).toBe(403);
    // and nothing changed
    expect((await DownloadGrant.findById(grant._id)).revoked).toBe(false);
  });
});
