// lib/rateLimit.js
// Simple in-memory fixed-window rate limiter for auth endpoints
// (login/register) — blunts brute-force and credential-stuffing attempts.
// Scoped to a single Node process: correct on a traditional server/VPS
// deployment, and degrades to "no limiting" on stateless serverless
// platforms (each invocation gets a fresh memory space) rather than
// breaking anything — swap in Redis there if you deploy serverless.
const buckets = new Map();

// occasionally sweep expired entries so the map doesn't grow unbounded
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}

export function rateLimit(key, { max = 8, windowMs = 10 * 60_000 } = {}) {
  sweep();
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true };
}

export function getClientIp(request) {
  const xff = request.headers?.get?.("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers?.get?.("x-real-ip") || "unknown";
}
