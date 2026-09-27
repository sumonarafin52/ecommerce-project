// tests/rateLimit.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB } from "./dbSetup";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

beforeAll(async () => {
  await startTestDB();
}, 90000);

afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
});

describe("rateLimit (MongoDB-backed)", () => {
  it("allows up to max, then blocks", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit("t:basic", { max: 3, windowMs: 60_000 })).allowed).toBe(true);
    }
    const blocked = await rateLimit("t:basic", { max: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps separate keys independent", async () => {
    for (let i = 0; i < 2; i++) await rateLimit("t:a", { max: 2, windowMs: 60_000 });
    expect((await rateLimit("t:a", { max: 2, windowMs: 60_000 })).allowed).toBe(false);
    expect((await rateLimit("t:b", { max: 2, windowMs: 60_000 })).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", async () => {
    await rateLimit("t:window", { max: 1, windowMs: 300 });
    expect((await rateLimit("t:window", { max: 1, windowMs: 300 })).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 400));
    expect((await rateLimit("t:window", { max: 1, windowMs: 300 })).allowed).toBe(true);
  });

  it("can't be raced past the limit by concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => rateLimit("t:race", { max: 5, windowMs: 60_000 }))
    );
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(5); // exactly the limit, never more
  });

  it("persists counts in the database, so every server instance shares them", async () => {
    await rateLimit("t:shared", { max: 10, windowMs: 60_000 });
    await rateLimit("t:shared", { max: 10, windowMs: 60_000 });
    const doc = await mongoose.connection.db.collection("ratelimits").findOne({ _id: "t:shared" });
    expect(doc.count).toBe(2);
  });
});

describe("getClientIp", () => {
  it("reads a Web Headers object (route handlers)", () => {
    const req = { headers: new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }) };
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("reads a plain-object header map (NextAuth authorize)", () => {
    // This is the shape NextAuth v4 passes — previously it always
    // resolved to "unknown", merging every user into one login bucket.
    const req = { headers: { "x-forwarded-for": "198.51.100.7" } };
    expect(getClientIp(req)).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp({ headers: { "x-real-ip": "192.0.2.9" } })).toBe("192.0.2.9");
  });

  it("returns 'unknown' only when there's genuinely no IP header", () => {
    expect(getClientIp({ headers: {} })).toBe("unknown");
    expect(getClientIp({})).toBe("unknown");
  });
});
