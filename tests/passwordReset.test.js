// tests/passwordReset.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import User from "@/models/User";

// Capture the reset link from the (mocked) email instead of sending mail.
const sentEmails = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (msg) => {
    sentEmails.push(msg);
    return { sent: true };
  }),
}));

const { POST: forgot } = await import("@/app/api/account/forgot-password/route");
const { POST: reset } = await import("@/app/api/account/reset-password/route");

let ipCounter = 0;
function req(url, body) {
  // unique IP per request so rate limits don't interfere across tests
  ipCounter++;
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}` },
    body: JSON.stringify(body),
  });
}

async function makeUser(email = "alice@example.com") {
  return User.create({ name: "Alice Smith", email, password: await bcrypt.hash("OldPassword9!", 12) });
}

// fire-and-forget email: give the background send a tick to land
const flush = () => new Promise((r) => setTimeout(r, 30));

function tokenFromLastEmail() {
  const html = sentEmails[sentEmails.length - 1].html;
  return html.match(/token=([a-f0-9]{64})/)[1];
}

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
  // ratelimits is written through the raw driver, not a Mongoose model, so
  // clearTestDB() doesn't reach it — without this the rate-limit test's
  // requests carry over and later tests hit the per-email cap.
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
  sentEmails.length = 0;
});

describe("forgot-password", () => {
  it("returns the identical response for a registered and an unknown email", async () => {
    await makeUser();
    const known = await (await forgot(req("/f", { email: "alice@example.com" }))).json();
    const unknown = await (await forgot(req("/f", { email: "nobody@example.com" }))).json();
    expect(known).toEqual(unknown); // no enumeration
    await flush();
    expect(sentEmails).toHaveLength(1); // but only the real account got mail
  });

  it("stores only a hash of the token, never the token itself", async () => {
    await makeUser();
    await forgot(req("/f", { email: "alice@example.com" }));
    await flush();
    const raw = tokenFromLastEmail();
    const user = await User.findOne({ email: "alice@example.com" }).select("+resetTokenHash");
    expect(user.resetTokenHash).not.toBe(raw);
    expect(user.resetTokenHash).toBe(crypto.createHash("sha256").update(raw).digest("hex"));
  });

  it("rejects a malformed email", async () => {
    const res = await forgot(req("/f", { email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated requests for the same email", async () => {
    await makeUser();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await forgot(req("/f", { email: "alice@example.com" }))).status);
    expect(statuses).toContain(429); // capped at 3/hour per email
  });
});

describe("reset-password", () => {
  async function issueToken() {
    await makeUser();
    await forgot(req("/f", { email: "alice@example.com" }));
    await flush();
    return tokenFromLastEmail();
  }

  it("resets the password with a valid token", async () => {
    const token = await issueToken();
    const res = await reset(req("/r", { token, password: "BrandNewPass7!" }));
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: "alice@example.com" }).select("+password");
    expect(await bcrypt.compare("BrandNewPass7!", user.password)).toBe(true);
    expect(await bcrypt.compare("OldPassword9!", user.password)).toBe(false);
  });

  it("is single-use — the same link can't be used twice", async () => {
    const token = await issueToken();
    expect((await reset(req("/r", { token, password: "BrandNewPass7!" }))).status).toBe(200);
    expect((await reset(req("/r", { token, password: "AnotherPass8!" }))).status).toBe(400);
  });

  it("lets only one of two simultaneous submissions succeed", async () => {
    const token = await issueToken();
    const [a, b] = await Promise.all([
      reset(req("/r", { token, password: "RacePassOne1!" })),
      reset(req("/r", { token, password: "RacePassTwo2!" })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });

  it("rejects an expired token", async () => {
    const token = await issueToken();
    await User.collection.updateOne(
      { email: "alice@example.com" },
      { $set: { resetTokenExpires: new Date(Date.now() - 1000) } }
    );
    expect((await reset(req("/r", { token, password: "BrandNewPass7!" }))).status).toBe(400);
  });

  it("rejects a well-formed but wrong token", async () => {
    await issueToken();
    const forged = crypto.randomBytes(32).toString("hex");
    expect((await reset(req("/r", { token: forged, password: "BrandNewPass7!" }))).status).toBe(400);
  });

  it("rejects malformed tokens before touching the database", async () => {
    for (const token of ["", "abc", "Z".repeat(64), null, 12345]) {
      expect((await reset(req("/r", { token, password: "BrandNewPass7!" }))).status).toBe(400);
    }
  });

  it("invalidates the older link when a new one is requested", async () => {
    const first = await issueToken();
    await forgot(req("/f", { email: "alice@example.com" }));
    await flush();
    const second = tokenFromLastEmail();
    expect(second).not.toBe(first);
    expect((await reset(req("/r", { token: first, password: "BrandNewPass7!" }))).status).toBe(400);
    expect((await reset(req("/r", { token: second, password: "BrandNewPass7!" }))).status).toBe(200);
  });

  it("refuses a weak new password and leaves the token usable", async () => {
    const token = await issueToken();
    expect((await reset(req("/r", { token, password: "123456" }))).status).toBe(400);
    // the weak attempt must not have consumed the link
    expect((await reset(req("/r", { token, password: "BrandNewPass7!" }))).status).toBe(200);
  });

  it("refuses a password containing the user's own name", async () => {
    const token = await issueToken();
    expect((await reset(req("/r", { token, password: "alice12345!" }))).status).toBe(400);
  });
});
