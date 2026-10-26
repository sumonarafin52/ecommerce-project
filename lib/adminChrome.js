// lib/adminChrome.js
//
// The two things the admin shell shows on every page: order counts for the
// badges, and whether the store can currently take an order.
//
// Both were being fetched by more than one component — the counts by the
// sidebar and the top header, readiness by the sidebar and the dashboard —
// so each admin page made duplicate requests for figures that are identical
// between them.
"use client";

import { createSingleFlight, jsonFetcher } from "@/lib/singleFlight";

export const orderCounts = createSingleFlight(jsonFetcher("/api/admin/orders/counts"));
export const storeReadiness = createSingleFlight(jsonFetcher("/api/admin/readiness"));

/** Call after anything that changes order state, so badges don't go stale. */
export function refreshAdminChrome() {
  orderCounts.clear();
  storeReadiness.clear();
}
