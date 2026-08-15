// lib/paymentGateways.js
// Single source of truth for every payment gateway's shape: which fields it
// needs, which of those are secrets (masked in the UI, never sent back to
// the browser once set), and whether it supports a sandbox/live toggle.
// Both app/api/settings/route.js and app/admin/settings/payment/page.js
// import this — add a new gateway here and it shows up in both places.

export const MASK = "••••••••";

// checkoutLive: true means this gateway is actually wired into the real
// checkout flow (app/checkout/page.js + app/api/orders + app/api/checkout).
// Gateways without a real integration yet are still configurable here
// (so credentials are ready to go) but are intentionally NOT offered to
// customers at checkout — showing them would be fake functionality.
export const PAYMENT_GATEWAYS = [
  {
    id: "cod",
    label: "Cash on Delivery",
    region: "bangladesh",
    hasModes: false,
    checkoutLive: true,
    description: "Customer pays in cash when the order is delivered.",
    fields: [],
  },
  {
    id: "sslcommerz",
    label: "SSLCommerz",
    region: "bangladesh",
    hasModes: true,
    checkoutLive: true,
    description: "Cards, mobile banking (bKash/Nagad/Rocket) and net banking via one aggregator.",
    fields: [
      { key: "storeId", label: "Store ID", type: "text", secret: false, required: true },
      { key: "storePassword", label: "Store Password", type: "password", secret: true, required: true },
    ],
  },
  {
    id: "bkash",
    label: "bKash",
    region: "bangladesh",
    hasModes: true,
    checkoutLive: false,
    description: "bKash Payment Gateway (PGW) checkout for direct bKash wallet payments.",
    fields: [
      { key: "appKey", label: "App Key", type: "text", secret: false, required: true },
      { key: "appSecret", label: "App Secret", type: "password", secret: true, required: true },
      { key: "username", label: "Username", type: "text", secret: false, required: true },
      { key: "password", label: "Password", type: "password", secret: true, required: true },
    ],
  },
  {
    id: "nagad",
    label: "Nagad",
    region: "bangladesh",
    hasModes: true,
    checkoutLive: false,
    description: "Nagad merchant checkout integration.",
    fields: [
      { key: "merchantId", label: "Merchant ID", type: "text", secret: false, required: true },
      { key: "merchantNumber", label: "Merchant Number", type: "text", secret: false, required: true },
      { key: "publicKey", label: "Public Key (PEM)", type: "textarea", secret: false, required: false },
      { key: "privateKey", label: "Private Key (PEM)", type: "textarea", secret: true, required: false },
    ],
  },
  {
    id: "rocket",
    label: "Rocket",
    region: "bangladesh",
    hasModes: false,
    checkoutLive: false,
    description: "Dutch-Bangla Rocket mobile banking — manual/reference-based checkout.",
    fields: [
      { key: "merchantNumber", label: "Merchant Number", type: "text", secret: false, required: true },
      { key: "apiKey", label: "API Key", type: "password", secret: true, required: false },
    ],
  },
  {
    id: "stripe",
    label: "Stripe",
    region: "international",
    hasModes: true,
    checkoutLive: false,
    description: "Cards and global payment methods via Stripe Checkout.",
    fields: [
      { key: "publishableKey", label: "Publishable Key", type: "text", secret: false, required: true },
      { key: "secretKey", label: "Secret Key", type: "password", secret: true, required: true },
      { key: "webhookSecret", label: "Webhook Signing Secret", type: "password", secret: true, required: false },
    ],
  },
  {
    id: "paypal",
    label: "PayPal",
    region: "international",
    hasModes: true,
    checkoutLive: false,
    description: "PayPal Checkout for international customers.",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", secret: false, required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", secret: true, required: true },
    ],
  },
];

export function getGateway(id) {
  return PAYMENT_GATEWAYS.find((g) => g.id === id) || null;
}

// A gateway is "ready" once every required field has a non-empty value.
export function isGatewayConfigured(gateway, fieldValues = {}) {
  return gateway.fields
    .filter((f) => f.required)
    .every((f) => String(fieldValues?.[f.key] || "").trim().length > 0);
}
