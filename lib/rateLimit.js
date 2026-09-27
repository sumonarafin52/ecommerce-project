// lib/rateLimit.js
//
// Fixed-window rate limiter, backed by MongoDB so the counts are shared by
// every server instance.
//
// The previous version kept counts in an in-process Map. That works on a
// single long-running server, but on serverless or multi-instance hosting
// each request can land on a different process with its own empty Map — so
// login/signup brute-force protection quietly did nothing. MongoDB is
// already shared infrastructure here, so it needs no new service (no Redis).
//
// If the database is unreachable the limiter falls back to the in-memory
// map rather than either failing open (no protection) or failing closed
// (locking every user out because of a DB blip).
import mongoose from "mongoose";
import connectDB from "@/lib/db";

const COLLECTION = "ratelimits";
let indexEnsured = false;

// ---- in-memory fallback -------------------------------------------------
const buckets = new Map();
let lastSweep = Date.now();

function memoryLimit(key, max, windowMs) {
  const now = Date.now();
  if (now - lastSweep > 5 * 60_000) {
    lastSweep = now;
    for (const [k, entry] of buckets) if (now > entry.resetAt) buckets.delete(k);
  }
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.count >= max) return { allowed: false, retryAfterMs: entry.resetAt - now };
  entry.count += 1;
  return { allowed: true };
}

// ---- shared (MongoDB) limiter --------------------------------------------
async function ensureIndex(collection) {
  if (indexEnsured) return;
  // TTL index: MongoDB deletes each bucket once its window has passed, so
  // the collection never grows unbounded
  await collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 });
  indexEnsured = true;
}

/**
 * @returns {Promise<{allowed: boolean, retryAfterMs?: number}>}
 * Must be awaited — an un-awaited call returns a Promise, whose `.allowed`
 * is undefined, which would read as "blocked" and lock everyone out.
 */
export async function rateLimit(key, { max = 8, windowMs = 10 * 60_000 } = {}) {
  try {
    await connectDB();
    const collection = mongoose.connection.db.collection(COLLECTION);
    await ensureIndex(collection);

    const now = new Date();
    const freshReset = new Date(now.getTime() + windowMs);

    // One atomic operation: if the current window is still open, increment
    // it; otherwise start a new window at count 1. Doing the read and the
    // write separately would let concurrent requests all read "under the
    // limit" and all get through.
    const doc = await collection.findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            count: {
              $cond: [{ $gt: ["$resetAt", now] }, { $add: ["$count", 1] }, 1],
            },
            resetAt: {
              $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", freshReset],
            },
          },
        },
      ],
      { upsert: true, returnDocument: "after", includeResultMetadata: false }
    );

    // driver v6: with includeResultMetadata:false this is the document itself
    const record = doc;
    if (!record) return { allowed: true };

    if (record.count > max) {
      return { allowed: false, retryAfterMs: new Date(record.resetAt).getTime() - now.getTime() };
    }
    return { allowed: true };
  } catch (err) {
    console.error("[rateLimit] shared limiter unavailable, using in-memory fallback:", err.message);
    return memoryLimit(key, max, windowMs);
  }
}

/**
 * Best-effort client IP.
 *
 * Handles both header shapes this codebase sees: a Web `Headers` object
 * (route handlers) and a plain object (NextAuth v4's authorize(), which
 * receives `Object.fromEntries(req.headers)`). Previously only the first
 * was handled, so inside login every request resolved to "unknown" — and
 * the per-IP login limit became a single bucket shared by the whole site.
 */
export function getClientIp(request) {
  const headers = request?.headers;
  const read = (name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };

  const xff = read("x-forwarded-for");
  if (xff) return String(xff).split(",")[0].trim();
  return read("x-real-ip") || "unknown";
}
