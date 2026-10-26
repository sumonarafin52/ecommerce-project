// lib/stockReasons.js
//
// The vocabulary for "why did stock change", and how each reason is worded.
//
// Separate from models/StockMovement.js, which defines the schema, because
// the admin's stock history page is a client component: importing these
// from the model drags mongoose into the browser bundle, where it fails at
// runtime with "Cannot read properties of undefined (reading
// 'StockMovement')" and takes the whole page down. Exactly the same split,
// for exactly the same reason, as lib/cartIssues.js.
//
// Deliberately a small, closed list. "Adjusted", with a free-text note,
// would make the history unsearchable within a month.
export const STOCK_REASONS = {
  SALE: "sale", // an order took it
  CANCELLED: "cancelled", // an order was cancelled and gave it back
  PAYMENT_FAILED: "payment_failed", // payment didn't complete; reservation released
  RETURNED: "returned", // a customer sent it back
  MANUAL: "manual", // staff set the number by hand
  CREATED: "created", // the product's opening stock
};

export const STOCK_REASON_LABELS = {
  [STOCK_REASONS.SALE]: "Sold",
  [STOCK_REASONS.CANCELLED]: "Order cancelled",
  [STOCK_REASONS.PAYMENT_FAILED]: "Payment failed",
  [STOCK_REASONS.RETURNED]: "Returned",
  [STOCK_REASONS.MANUAL]: "Changed by staff",
  [STOCK_REASONS.CREATED]: "Opening stock",
};
