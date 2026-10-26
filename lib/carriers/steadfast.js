// lib/carriers/steadfast.js
//
// Steadfast Courier, one of the couriers most Bangladeshi online stores use.
// Written against their published merchant API.
//
// IMPORTANT, and said plainly in the admin UI too: this was written from
// Steadfast's documentation and has NOT been exercised against a live
// merchant account — nobody here has one. The field names and endpoints come
// from their docs, not from a successful call. That is why "Test connection"
// exists and why the settings screen tells the admin to use it before an
// order depends on this. If their API differs from the documentation, the
// test will say so, with their own error text, rather than a customer
// finding out when a parcel is never collected.
import { mapStatus, recipientFrom, codAmountFor } from "@/lib/carriers/adapter";

const BASE = "https://portal.packzy.com/api/v1";

// Steadfast's delivery statuses, mapped onto the shipment timeline's.
// Anything not listed stays unmapped rather than being guessed at.
const STATUS_MAP = {
  pending: "pending",
  in_review: "pending",
  hold: "pending",
  delivered_approval_pending: "out_for_delivery",
  partial_delivered_approval_pending: "out_for_delivery",
  cancelled_approval_pending: "failed",
  unknown_approval_pending: "in_transit",
  delivered: "delivered",
  partial_delivered: "delivered",
  cancelled: "cancelled",
  unknown: "in_transit",
};

function headers(creds) {
  return {
    "Api-Key": creds.apiKey || "",
    "Secret-Key": creds.secretKey || "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export const steadfastCarrier = {
  id: "steadfast",
  label: "Steadfast Courier",
  description:
    "Books consignments and reads delivery status over Steadfast's merchant API. Written from their published documentation — test the connection before relying on it.",
  // Shown next to the provider in the admin so nobody assumes more than is true.
  verified: false,

  capabilities: { booking: true, statusFetch: true, label: false },

  fields: [
    { key: "apiKey", label: "API Key", secret: false, required: true },
    { key: "secretKey", label: "Secret Key", secret: true, required: true },
  ],

  isConfigured(creds) {
    return !!(creds?.apiKey && creds?.secretKey);
  },

  /**
   * Steadfast has no dedicated ping endpoint, so this asks for the account's
   * current balance — a cheap authenticated read that fails loudly on bad
   * credentials.
   */
  async testConnection(creds) {
    if (!this.isConfigured(creds)) {
      return { ok: false, message: "Enter both the API key and the secret key first." };
    }
    try {
      const res = await fetch(`${BASE}/get_balance`, { method: "GET", headers: headers(creds) });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, message: `Unexpected reply from Steadfast (${res.status}): ${text.slice(0, 160)}` };
      }
      if (res.ok && (body.status === 200 || body.current_balance !== undefined)) {
        const balance = body.current_balance;
        return {
          ok: true,
          message: balance === undefined ? "Credentials accepted." : `Credentials accepted. Balance: ${balance}`,
        };
      }
      return { ok: false, message: body?.message || `Steadfast refused the credentials (${res.status}).` };
    } catch (err) {
      return { ok: false, message: `Couldn't reach Steadfast: ${err?.message || "request failed"}` };
    }
  },

  /**
   * Creates a consignment. `invoice` must be unique per booking on their
   * side, so the order number is used — which also means a repeated booking
   * for the same order is rejected by them rather than creating a duplicate
   * parcel.
   */
  async book({ order, creds, note }) {
    if (!this.isConfigured(creds)) {
      return { ok: false, error: "Steadfast isn't configured for this carrier." };
    }
    const to = recipientFrom(order);
    if (!to.phone) {
      return { ok: false, error: "This order has no phone number, and the courier requires one." };
    }

    const payload = {
      invoice: order.orderNumber,
      recipient_name: to.name,
      recipient_phone: to.phone,
      recipient_address: to.address,
      // Zero on a prepaid order — sending the total would have the rider
      // collect money the customer already paid.
      cod_amount: codAmountFor(order),
      note: note || "",
    };

    try {
      const res = await fetch(`${BASE}/create_order`, {
        method: "POST",
        headers: headers(creds),
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, error: `Unexpected reply from Steadfast (${res.status}): ${text.slice(0, 160)}` };
      }

      const consignment = body?.consignment;
      if (res.ok && consignment?.consignment_id) {
        return {
          ok: true,
          consignmentId: String(consignment.consignment_id),
          trackingNumber: String(consignment.tracking_code || consignment.consignment_id),
          status: mapStatus(consignment.status, STATUS_MAP) || "pending",
        };
      }
      return { ok: false, error: body?.message || `Steadfast rejected the booking (${res.status}).` };
    } catch (err) {
      return { ok: false, error: `Couldn't reach Steadfast: ${err?.message || "request failed"}` };
    }
  },

  async fetchStatus({ trackingNumber, consignmentId, creds }) {
    if (!this.isConfigured(creds)) return { ok: false, error: "Steadfast isn't configured for this carrier." };

    // Prefer their consignment id; fall back to the tracking code.
    const path = consignmentId
      ? `status_by_cid/${encodeURIComponent(consignmentId)}`
      : `status_by_trackingcode/${encodeURIComponent(trackingNumber || "")}`;
    if (!consignmentId && !trackingNumber) return { ok: false, error: "No tracking number to look up." };

    try {
      const res = await fetch(`${BASE}/${path}`, { method: "GET", headers: headers(creds) });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, error: `Unexpected reply from Steadfast (${res.status}): ${text.slice(0, 160)}` };
      }

      const raw = body?.delivery_status;
      if (!res.ok || !raw) {
        return { ok: false, error: body?.message || `Steadfast couldn't find that consignment (${res.status}).` };
      }

      const status = mapStatus(raw, STATUS_MAP);
      return {
        ok: true,
        status, // null when their wording isn't one we recognise
        rawStatus: String(raw),
        events: status ? [{ status, note: `Steadfast: ${raw}`, at: new Date() }] : [],
      };
    } catch (err) {
      return { ok: false, error: `Couldn't reach Steadfast: ${err?.message || "request failed"}` };
    }
  },
};

export default steadfastCarrier;
