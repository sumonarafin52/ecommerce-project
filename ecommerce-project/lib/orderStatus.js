// lib/orderStatus.js
// Single source of truth for the order-status pipeline. Pure logic/data —
// no server-only imports — so both API routes and client components can
// import it directly and never drift out of sync with each other.
//
// orderStatus values:
//   pending     — order placed, awaiting payment confirmation (online
//                 payment methods only; COD orders skip straight to
//                 "processing" since there's nothing to wait on)
//   processing  — confirmed/paid, staff can start picking & packing
//   on_hold     — paused at whatever stage it was in; previousStatus on
//                 the order document remembers that stage so releasing
//                 the hold restores it exactly, instead of losing where
//                 the order was (this replaces the old standalone
//                 `onHold` boolean, which could drift out of sync with
//                 orderStatus since it lived alongside it)
//   shipped     — dispatched
//   delivered   — completed (terminal for the happy path)
//   cancelled   — terminal
//   returned    — customer returned the order after delivery (terminal)

export const ORDER_STATUSES = ["pending", "processing", "on_hold", "shipped", "delivered", "cancelled", "returned"];

export const ORDER_STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  on_hold: "On Hold",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

// Tailwind classes for badges — shared by every admin/customer screen that
// renders an order-status pill, so a new status only needs defining once.
export const ORDER_STATUS_COLORS = {
  pending: "bg-zinc-500/15 text-zinc-400",
  processing: "bg-accent/15 text-accent",
  on_hold: "bg-red-500/15 text-red-400",
  shipped: "bg-blue-500/15 text-blue-400",
  delivered: "bg-green-500/15 text-green-400",
  cancelled: "bg-red-500/15 text-red-400",
  returned: "bg-amber-500/15 text-amber-400",
};

// Which statuses a given status may move to next. "on_hold" is reachable
// from (and returns to) any non-terminal status — see putOnHold/releaseHold
// below, which drive that through previousStatus rather than this table.
export const VALID_TRANSITIONS = {
  pending: ["pending", "processing", "on_hold", "cancelled"],
  processing: ["processing", "on_hold", "shipped", "cancelled"],
  on_hold: ["on_hold", "pending", "processing", "shipped", "cancelled"], // release targets vary by previousStatus
  shipped: ["shipped", "on_hold", "delivered", "cancelled", "returned"],
  delivered: ["delivered", "returned"], // a delivered order isn't un-delivered, but can be returned
  cancelled: ["cancelled"], // terminal
  returned: ["returned"], // terminal
};

export function isValidTransition(from, to) {
  if (from === to) return true;
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

export function nextAllowedStatuses(from) {
  return VALID_TRANSITIONS[from] || [];
}

// Mutates `order` to place it on hold, remembering the stage to restore to.
// Safe to call even if already on hold (no-op on previousStatus).
export function putOnHold(order, reason) {
  if (order.orderStatus !== "on_hold") {
    order.previousStatus = order.orderStatus;
    order.orderStatus = "on_hold";
  }
  order.holdReason = reason || "";
}

// Mutates `order` to release a hold, restoring whatever stage it was in
// before — falling back to "processing" if that's somehow missing.
export function releaseHold(order) {
  order.orderStatus = order.previousStatus || "processing";
  order.previousStatus = undefined;
  order.holdReason = "";
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
