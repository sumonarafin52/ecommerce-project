// lib/dbTransaction.js
import mongoose from "mongoose";

let transactionsSupported = null; // cached across calls in the same process

/**
 * Runs `fn(session)` inside a real MongoDB transaction when the connected
 * server supports one (replica set / Atlas), and falls back to running
 * `fn(null)` without a session on a standalone server that doesn't.
 *
 * Callers must write every write operation to accept and pass through the
 * `session` argument (it's a no-op when session is null), and must rely on
 * per-document atomic conditions (e.g. `findOneAndUpdate` with a `$gte`
 * guard) for the operations that need concurrency-safety regardless of
 * transaction support — the transaction adds cross-document all-or-nothing
 * rollback on top of that, it isn't the only thing preventing overselling.
 */
export async function runInTransaction(fn) {
  if (transactionsSupported === false) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    transactionsSupported = true;
    return result;
  } catch (err) {
    const notSupported =
      /Transaction numbers|IllegalOperation|replica set|not supported/i.test(err?.message || "") ||
      err?.code === 20 /* IllegalOperation */;
    if (notSupported && transactionsSupported === null) {
      transactionsSupported = false;
      console.warn(
        "[dbTransaction] MongoDB transactions aren't supported on this deployment (standalone server, not a replica set) — falling back to non-transactional atomic operations. Stock/coupon safety is still enforced via per-document conditional updates; only cross-document all-or-nothing rollback is unavailable."
      );
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
