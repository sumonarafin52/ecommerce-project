// lib/carriers/index.js
//
// The registry of courier integrations, and how a carrier's credentials are
// loaded. Same shape as lib/payments/index.js, for the same reason: adding a
// courier should be one new file plus one line here, with nothing in the
// order or shipment routes needing to change.
import manualCarrier from "@/lib/carriers/manual";
import steadfastCarrier from "@/lib/carriers/steadfast";
import { decryptSecret } from "@/lib/crypto";

const ADAPTERS = {
  [manualCarrier.id]: manualCarrier,
  [steadfastCarrier.id]: steadfastCarrier,
};

/** Every integration an admin can pick, manual first — it's the usual case. */
export function listCarrierProviders() {
  return Object.values(ADAPTERS).map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description || "",
    capabilities: a.capabilities,
    fields: (a.fields || []).map((f) => ({ key: f.key, label: f.label, secret: !!f.secret, required: !!f.required })),
    // false means: written from the provider's documentation, never run
    // against a live account here. The admin is told so, and told to test.
    verified: a.verified !== false,
  }));
}

/** The adapter for a provider id. Unknown ids fall back to manual, never to nothing. */
export function getCarrierAdapter(id) {
  return ADAPTERS[String(id || "")] || manualCarrier;
}

/**
 * The adapter for a carrier record, plus its decrypted credentials.
 *
 * A carrier whose API has been switched off falls back to manual, so
 * disabling an integration immediately returns the store to typing tracking
 * numbers by hand rather than failing bookings.
 */
export function adapterForCarrier(carrier) {
  const providerId = carrier?.api?.connected ? carrier?.api?.provider : "manual";
  const adapter = getCarrierAdapter(providerId);

  const credentials = {};
  const stored = carrier?.api?.credentials || {};
  for (const field of adapter.fields || []) {
    const raw = stored instanceof Map ? stored.get(field.key) : stored[field.key];
    if (!raw) continue;
    credentials[field.key] = field.secret ? decryptSecret(raw) : raw;
  }

  return { adapter, credentials };
}
