// lib/payments/adapter.js
//
// The contract every payment provider implements, plus the idempotency
// helper they all share.
//
// Why an adapter layer at all: the checkout route previously spoke
// SSLCommerz directly — its SDK, its field names, its status strings, its
// validation endpoint — all inline. Adding bKash or Stripe meant either a
// second branch through the same route or a parallel copy of it. A provider
// is now a file that implements the shape below, and the route doesn't know
// which one it's talking to.
//
// An adapter implements:
//
//   id            string, matches the id in lib/paymentGateways.js
//   label         what the customer sees
//   capabilities  { hostedPage, refunds, partialRefunds, webhooks }
//
//   isConfigured(credentials) -> boolean
//       Whether this provider has everything it needs to take a payment.
//
//   initiate({ order, credentials, origin, customer, currency })
//       -> { ok, redirectUrl?, providerRef?, error? }
//       Starts a payment. For a hosted-page provider this returns the URL to
//       send the customer to.
//
//   parseCallback(fields)
//       -> { orderId, eventId, rawStatus, verificationToken? }
//       Reads the provider's callback into a shape the route understands.
//       `eventId` must be stable for a given event and different for
//       different ones — it's what makes replay protection work.
//
//   verify({ verificationToken, orderId, credentials, expectedAmount })
//       -> { ok, paid, amount, currency, transactionId, providerRef, reason }
//       Asks the PROVIDER what really happened. Never trusts the callback's
//       own claim: a callback arrives over the open internet and anybody can
//       post one.
//
//   refund({ order, amount, credentials })  (optional)
//       -> { ok, refundId?, error? }
//
// An adapter that can't do something says so in `capabilities` rather than
// pretending — a refund button that silently does nothing is worse than one
// that isn't there.
import PaymentEvent from "@/models/PaymentEvent";

/**
 * Claims a payment event for processing, exactly once.
 *
 * Returns true if this caller should handle it, false if it's already been
 * handled. The decision is the success or failure of a unique insert, so
 * it's atomic — two simultaneous deliveries of the same event cannot both
 * get a true.
 *
 * Callers treat a false as "nothing to do", not as an error: a gateway
 * retrying a callback it already delivered is normal, not a fault.
 */
export async function claimPaymentEvent({ provider, eventId, order, status, amount, currency, transactionId, note }) {
  if (!provider || !eventId) return false;
  try {
    await PaymentEvent.create({
      provider,
      eventId: String(eventId).slice(0, 200),
      order: order || null,
      status: String(status || "").slice(0, 60),
      amount: Number(amount) || 0,
      currency: String(currency || "").slice(0, 10),
      transactionId: String(transactionId || "").slice(0, 120),
      note: String(note || "").slice(0, 300),
      at: new Date(),
    });
    return true;
  } catch (err) {
    // 11000 is the duplicate-key error: this event was already recorded, so
    // somebody else has handled it.
    if (err?.code === 11000) return false;
    // Any other failure (database down) must not silently skip a real
    // payment. Let the caller proceed and rely on its own paid-check.
    console.error("[payments] could not record event", err);
    return true;
  }
}

/** Records what a claimed event ended up doing, for support and reconciliation. */
export async function recordEventOutcome({ provider, eventId, outcome }) {
  try {
    await PaymentEvent.updateOne(
      { provider, eventId: String(eventId).slice(0, 200) },
      { $set: { outcome: String(outcome || "").slice(0, 120) } }
    );
  } catch {
    /* best effort — the outcome note is for humans, not for control flow */
  }
}

/**
 * Amounts from two different systems rarely match to the cent, so comparison
 * allows a small tolerance — but only a small one. A mismatch larger than
 * this means the customer paid a different amount than the order says, which
 * is never something to wave through.
 */
export function amountsMatch(a, b, tolerance = 1) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < tolerance;
}
