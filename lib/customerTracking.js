// lib/customerTracking.js
//
// What a customer is allowed to see about their parcels, in one shape, from
// one place.
//
// Orders carry shipments in two forms. `fulfillments[]` is the live one: the
// admin's "Create shipment" writes there, one entry per parcel, which is what
// partial fulfillment needs. The singular `shipment` predates it and is still
// written by the older /api/orders/[id]/shipment endpoint, so orders placed
// before fulfillments existed only have that.
//
// Until this module existed, the customer-facing surfaces (the public /track
// page and the profile's order tracking) read ONLY the singular field. An
// admin would create a shipment, add a carrier and a tracking number, watch
// the admin page fill in — and the customer's tracking page stayed
// completely empty. Everything the partial-fulfillment system recorded was
// invisible to the only person who needed it.
//
// So: read both, prefer fulfillments, and return the same shape either way.

/** Staff-facing fields that must never reach the customer. */
function publicCarrier(carrier) {
  if (!carrier || typeof carrier !== "object") return null;
  return {
    name: carrier.name || "",
    trackingUrlTemplate: carrier.trackingUrlTemplate || "",
  };
}

/** A tracking link, if the carrier gave us a template to build one from. */
export function trackingUrlFor(carrier, trackingNumber) {
  const template = carrier?.trackingUrlTemplate;
  if (!template || !trackingNumber) return "";
  // Carriers were configured with either placeholder over time; accept both
  // rather than silently producing a dead link.
  return template.replace(/\{tracking_number\}|\{tracking\}/g, encodeURIComponent(trackingNumber));
}

function publicTimeline(timeline) {
  return (timeline || [])
    .map((ev) => ({
      status: ev.status,
      note: ev.note || "",
      location: ev.location || "",
      at: ev.at,
    }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * One parcel, as the customer sees it.
 *
 * `notes` is deliberately dropped — on a fulfillment that field is the staff
 * note ("call before 5pm", "replacement for a broken one"), not a message to
 * the customer.
 */
function publicShipment(source, index) {
  const carrier = publicCarrier(source.carrier);
  const trackingNumber = source.trackingNumber || "";
  return {
    id: String(source._id || `legacy-${index}`),
    label: `Shipment ${index + 1}`,
    status: source.status || publicTimeline(source.timeline).at(-1)?.status || "pending",
    carrierName: carrier?.name || "",
    trackingNumber,
    trackingUrl: trackingUrlFor(carrier, trackingNumber),
    estimatedDelivery: source.estimatedDelivery || null,
    items: (source.items || []).map((it) => ({ name: it.name, quantity: it.quantity })),
    timeline: publicTimeline(source.timeline),
  };
}

/** True when this order's shipments live in the legacy singular field only. */
function hasLegacyShipment(order) {
  const s = order?.shipment;
  if (!s) return false;
  return !!(s.trackingNumber || s.carrier || s.timeline?.length);
}

/**
 * Everything the customer's tracking view needs.
 *
 * Returns `shipments` (possibly several — one order can ship in parts) and
 * `overall`, the single status to headline. `overall` is the least advanced
 * of the parcels, because an order isn't delivered until the last box is.
 */
export function customerTracking(order) {
  const fulfillments = order?.fulfillments || [];

  const shipments = fulfillments.length
    ? fulfillments.map((f, i) => publicShipment(f, i))
    : hasLegacyShipment(order)
    ? [publicShipment(order.shipment, 0)]
    : [];

  // A single parcel needs no "Shipment 1" heading.
  if (shipments.length === 1) shipments[0].label = "";

  return {
    shipments,
    overall: overallStatus(shipments),
    // Items on the order that no parcel covers yet, so a customer with a
    // part-shipped order isn't left wondering where the rest went.
    awaitingShipment: awaitingShipment(order, fulfillments),
  };
}

const PROGRESS = ["pending", "confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered"];

function overallStatus(shipments) {
  if (!shipments.length) return "";
  // A failed or returned parcel is the headline regardless of the others —
  // it's the one thing the customer has to act on.
  const exception = shipments.find((s) => ["failed", "returned", "cancelled"].includes(s.status));
  if (exception) return exception.status;

  let lowest = null;
  for (const s of shipments) {
    const i = PROGRESS.indexOf(s.status);
    if (i === -1) continue;
    if (lowest === null || i < lowest) lowest = i;
  }
  return lowest === null ? shipments[0].status : PROGRESS[lowest];
}

/** Item names and quantities not covered by any shipment yet. */
function awaitingShipment(order, fulfillments) {
  if (!fulfillments.length) return [];
  const shipped = new Map();
  for (const f of fulfillments) {
    for (const it of f.items || []) {
      const key = String(it.product?._id || it.product);
      shipped.set(key, (shipped.get(key) || 0) + (it.quantity || 0));
    }
  }
  return (order.items || [])
    .map((it) => {
      const key = String(it.product?._id || it.product);
      const remaining = (it.quantity || 0) - (shipped.get(key) || 0);
      return { name: it.name, quantity: remaining };
    })
    .filter((it) => it.quantity > 0);
}
