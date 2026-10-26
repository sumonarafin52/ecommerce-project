// lib/carriers/manual.js
//
// The default courier integration: none.
//
// This is not a placeholder. Most couriers a store of this size uses —
// local delivery, a rider, a courier whose API needs a signed contract —
// are booked on their own portal or over the phone, and the consignment
// number is typed in here afterwards. That workflow is the normal case, so
// it is a first-class adapter rather than an "unsupported" branch.
//
// It reports `booking: false`, which is what stops the shipment screen from
// offering a "Book with carrier" button that couldn't do anything.
export const manualCarrier = {
  id: "manual",
  label: "Manual (no API)",
  description:
    "Book with the courier yourself and enter the tracking number here. Works with any courier, including ones with no API.",

  capabilities: { booking: false, statusFetch: false, label: false },
  fields: [],

  isConfigured() {
    return true; // nothing to configure — that's the point
  },

  async testConnection() {
    return { ok: true, message: "Nothing to test — tracking numbers are entered by hand for this courier." };
  },
};

export default manualCarrier;
