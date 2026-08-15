// lib/orderStatus.js
// Single source of truth for two things every order-management screen
// needs: (1) which orderStatus transitions are valid from a given state,
// and (2) the *derived* fulfillment status (unfulfilled / partially
// fulfilled / fulfilled) computed from items vs. fulfillments — this is
// never stored, always computed, so it can never drift out of sync.

// orderStatus stays a 4-value enum on purpose (see models/Order.js comment)
// — it's read by dashboard stats, exports, customer order list, and tab
// filters throughout the app, so it isn't expanded here. This map just
// constrains which of those 4 values can follow which.
export const VALID_TRANSITIONS = {
  processing: ["processing", "shipped", "cancelled"],
  shipped: ["shipped", "delivered", "cancelled"],
  delivered: ["delivered"], // terminal — a delivered order isn't un-delivered
  cancelled: ["cancelled"], // terminal
};

export function isValidTransition(from, to) {
  if (from === to) return true;
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

export function nextAllowedStatuses(from) {
  return VALID_TRANSITIONS[from] || [];
}

// Sum of quantity already placed into a fulfillment, per product id.
function fulfilledQuantities(fulfillments = []) {
  const map = new Map();
  for (const f of fulfillments) {
    for (const it of f.items || []) {
      const key = String(it.product?._id || it.product);
      map.set(key, (map.get(key) || 0) + it.quantity);
    }
  }
  return map;
}

/**
 * @returns "unfulfilled" | "partially_fulfilled" | "fulfilled"
 */
export function computeFulfillmentStatus(order) {
  const items = order.items || [];
  if (!items.length) return "unfulfilled";
  const fulfilledMap = fulfilledQuantities(order.fulfillments || []);
  let anyFulfilled = false;
  let allFulfilled = true;
  for (const it of items) {
    const key = String(it.product?._id || it.product);
    const done = fulfilledMap.get(key) || 0;
    if (done > 0) anyFulfilled = true;
    if (done < it.quantity) allFulfilled = false;
  }
  if (allFulfilled) return "fulfilled";
  if (anyFulfilled) return "partially_fulfilled";
  return "unfulfilled";
}

// Remaining (not-yet-fulfilled) quantity per item — what "Create shipment"
// is allowed to draw from.
export function remainingItemsToFulfill(order) {
  const fulfilledMap = fulfilledQuantities(order.fulfillments || []);
  return (order.items || [])
    .map((it) => {
      const key = String(it.product?._id || it.product);
      const done = fulfilledMap.get(key) || 0;
      const remaining = Math.max(0, it.quantity - done);
      return { product: key, name: it.name, remaining };
    })
    .filter((it) => it.remaining > 0);
}

export const FULFILLMENT_LABELS = {
  unfulfilled: "Unfulfilled",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
};
