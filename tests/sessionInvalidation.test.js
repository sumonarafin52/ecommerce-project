// tests/sessionInvalidation.test.js
// Exercises the real NextAuth callbacks: a session issued before the
// password changed must stop working, without breaking normal sessions.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import User from "@/models/User";

// the auth module validates this at import time
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-0123456789abcdefghijklmnop";
const { authOptions } = await import("@/app/api/auth/[...nextauth]/route");
const { jwt, session: sessionCb } = authOptions.callbacks;

const secondsAgo = (s) => Math.floor((Date.now() - s * 1000) / 1000);
let user;

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  user = await User.create({ name: "Rahim", email: `r${Date.now()}@t.com`, password: "x", role: "customer" });
});

const tokenFor = (overrides = {}) => ({ id: String(user._id), role: "customer", iat: secondsAgo(60), ...overrides });

describe("session invalidation on password change", () => {
  it("leaves a normal session alone", async () => {
    const t = await jwt({ token: tokenFor() });
    expect(t.invalidated).toBeFalsy();
    const s = await sessionCb({ session: { user: {} }, token: t });
    expect(s).not.toBeNull();
    expect(s.user.id).toBe(String(user._id));
  });

  it("rejects a session issued before the password changed", async () => {
    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date() } });
    const t = await jwt({ token: tokenFor({ iat: secondsAgo(3600) }) }); // signed in an hour ago
    expect(t.invalidated).toBe(true);
    expect(await sessionCb({ session: { user: {} }, token: t })).toBeNull();
  });

  it("keeps a session issued AFTER the password changed (the new sign-in)", async () => {
    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date(Date.now() - 60_000) } });
    const t = await jwt({ token: tokenFor({ iat: secondsAgo(5) }) }); // signed in just now
    expect(t.invalidated).toBeFalsy();
    expect(await sessionCb({ session: { user: {} }, token: t })).not.toBeNull();
  });

  it("doesn't kill the very token minted by the password change itself", async () => {
    // same instant, within the clock-skew allowance
    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date() } });
    const t = await jwt({ token: tokenFor({ iat: Math.floor(Date.now() / 1000) }) });
    expect(t.invalidated).toBeFalsy();
  });

  it("invalidates the session of a deleted account", async () => {
    const t0 = tokenFor();
    await User.deleteOne({ _id: user._id });
    const t = await jwt({ token: t0 });
    expect(t.invalidated).toBe(true);
    expect(await sessionCb({ session: { user: {} }, token: t })).toBeNull();
  });

  it("only re-checks every 5 minutes, not on every request", async () => {
    const t1 = await jwt({ token: tokenFor() });
    expect(t1.pwCheckedAt).toBeTruthy();
    // password changes now, but the token was just checked…
    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date() } });
    const t2 = await jwt({ token: { ...t1 } });
    expect(t2.invalidated).toBeFalsy(); // still inside the 5-minute window
    // …and once the window passes, it's evicted
    const t3 = await jwt({ token: { ...t1, pwCheckedAt: Date.now() - 6 * 60_000 } });
    expect(t3.invalidated).toBe(true);
  });

  it("picks up a role change without a new sign-in", async () => {
    await User.updateOne({ _id: user._id }, { $set: { role: "admin" } });
    const t = await jwt({ token: tokenFor() });
    expect(t.role).toBe("admin");
  });

  it("stores the login details on first sign-in", async () => {
    const t = await jwt({ token: {}, user: { id: String(user._id), role: "customer", email: user.email } });
    expect(t.id).toBe(String(user._id));
    expect(t.role).toBe("customer");
  });
});
