// lib/carriers/adapter.js
//
// The contract a courier integration implements.
//
// Most couriers a small store uses have no API at all, or one you only get
// after signing a contract. So the default — and the honest baseline — is
// the manual workflow: the admin books on the courier's own portal or over
// the phone, and types the consignment number in here. That is what
// `manual.js` is, and it is a real implementation, not a placeholder.
//
// A courier that does have an API implements the same shape, and the
// shipment screen then offers to book and to fetch status. Nothing in the
// order flow knows which kind it's dealing with.
//
// An adapter implements:
//
//   id, label
//   capabilities { booking, statusFetch, label }
//       What this courier can actually do. The UI offers exactly these and
//       nothing more — a "Book with carrier" button that silently does
//       nothing is worse than no button.
//   fields[]            credentials the admin must supply
//   isConfigured(creds) -> boolean
//   testConnection(creds) -> { ok, message }
//       Proves the credentials work, before an order depends on them.
//   book({ order, items, creds, store }) -> { ok, consignmentId, trackingNumber, error }
//   fetchStatus({ trackingNumber, consignmentId, creds }) -> { ok, status, events[], error }

/**
 * Normalised courier statuses — the vocabulary every adapter translates its
 * own wording into.
 *
 * This is deliberately NOT the same list as the shipment timeline's statuses
 * in models/Order.js. The timeline is what the customer reads, and its stages
 * ("Order Confirmed → Processing → Shipped → …") describe the order's
 * journey; this list describes where a parcel physically is, which is a
 * courier's concern. Use `timelineStatusFor` to cross between them — writing
 * a courier status straight into the timeline fails schema validation, which
 * is how this difference was found.
 */
export const SHIPMENT_STATUSES = [
  "pending",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
  "cancelled",
];

/**
 * A courier status, expressed in the words the customer's timeline uses.
 *
 * "pending" means the courier has the booking but hasn't collected the parcel
 * yet, which is the order still being processed; "picked_up" is the moment it
 * ships. The rest already share a name.
 */
const TIMELINE_EQUIVALENT = {
  pending: "processing",
  picked_up: "shipped",
};

export function timelineStatusFor(carrierStatus) {
  const key = String(carrierStatus || "");
  if (!SHIPMENT_STATUSES.includes(key)) return null;
  return TIMELINE_EQUIVALENT[key] || key;
}

/**
 * Maps a courier's own status wording onto ours.
 *
 * Couriers each invent their own vocabulary ("hold", "in_review",
 * "partial_delivered"). Anything unrecognised returns null rather than being
 * guessed at — a wrong status on a customer's tracking page is worse than
 * no update, because they act on it.
 */
export function mapStatus(raw, table = {}) {
  const key = String(raw || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (SHIPMENT_STATUSES.includes(key)) return key;
  return table[key] || null;
}

/** Everything a courier needs to know about where a parcel is going. */
export function recipientFrom(order) {
  const a = order.shippingAddress || {};
  return {
    name: a.fullName || "Customer",
    phone: a.phone || "",
    address: [a.address, a.city, a.state, a.postalCode].filter(Boolean).join(", "),
    city: a.city || "",
  };
}

/**
 * What the courier should collect on delivery. Zero for an order that's
 * already been paid — sending the order total as COD on a prepaid order
 * makes the courier charge the customer twice.
 */
export function codAmountFor(order) {
  if (order.paymentStatus === "paid") return 0;
  return Math.max(0, Number(order.totalAmount) || 0);
}
