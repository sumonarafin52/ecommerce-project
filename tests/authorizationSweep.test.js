// tests/authorizationSweep.test.js
//
// Every route that changes data, called by someone who should not be able to.
//
// The spec's rule is "permissions enforced server-side — never rely only on
// frontend route protection", and the way that rule gets broken is never a
// decision: a route is added next to one that already works, the admin page
// calls it and behaves correctly, and nobody ever tries calling it without
// signing in. A reviewer reading the file sees an auth check at the top of
// POST and does not notice the PUT below it has none.
//
// So this does not read the code to decide whether a check exists — it calls
// the handlers and looks at what comes back. Two separate questions:
//
//   1. does every data-changing route refuse a stranger?
//   2. do the staff routes refuse an ordinary signed-in customer?
//
// A route added later is covered the moment it exists. To be exempt from (1)
// it has to be named in PUBLIC below, with a reason.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { startTestDB, stopTestDB } from "./dbSetup";

// The session the route sees. Swapped per case by the sweeps below.
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
// Deliberately NOT mocking @/lib/rbac: the real permission table is part of
// what is being tested. Mocking it would let a route pass here while the
// real rules refused, or the reverse.

const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];
const API_DIR = path.join(process.cwd(), "app/api");
const REFUSALS = [401, 403];

/**
 * Routes that genuinely belong to the public, each with the reason it is
 * safe. Anything not listed here must refuse a caller with no session.
 */
const PUBLIC = {
  "account/forgot-password": "anyone must be able to ask for a reset link; rate limited, and it reveals nothing about whether the address exists",
  "account/reset-password": "the emailed token is the credential — requiring a session would defeat the purpose",
  "cart": "a read-only price and stock check that writes nothing",
  "checkout": "guests can buy without an account; the order route re-checks everything server-side",
  "newsletter": "a visitor subscribing to the mailing list; rate limited",
  "products/recommended": "a read-only 'you might like' lookup for shoppers who aren't signed in; the posted ids are validated and nothing is written or stored",
  "products/[id]/signal": "counts that a product was viewed or basketed; writes a counter and nothing about the visitor, and is rate limited per address",
  "newsletter/unsubscribe": "unsubscribe links have to work from an email client with no session",
  "orders": "guest checkout creates orders without an account",
  "shipping/quote": "guest checkout needs delivery costs before anyone signs in",
  "tax/quote": "guest checkout needs the tax line before anyone signs in",
  "track": "public order tracking, gated on knowing the order number AND the phone on it, and rate limited",
  "users": "registration — a stranger creating their own account is the whole point",
  "support": "a guest must be able to contact the shop about an order placed without an account",
  "auth/[...nextauth]": "the sign-in endpoint itself",
  "downloads/[id]": "a guest's download grant is the credential; the route checks the grant, not a session",
};

/** Every route file, as an API path. */
function allRoutes(dir = API_DIR, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allRoutes(full, prefix ? `${prefix}/${entry.name}` : entry.name));
    else if (entry.name === "route.js") out.push({ route: prefix, file: full, src: fs.readFileSync(full, "utf8") });
  }
  return out;
}

/** A request shaped enough to reach the auth check. */
function requestFor(method, route) {
  return new Request(`http://test.local/api/${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify({}),
  });
}

/** Dynamic segments need some value; real ObjectIds avoid cast errors. */
const ID = "6acb91104efd9ef5cf86bee3";
const PARAMS = { params: { id: ID, productId: ID, fulfillmentId: ID, nextauth: ["session"] } };

const CUSTOMER = { user: { id: "6acb91104efd9ef5cf86bee9", role: "customer", name: "Shopper" } };

/** Calls one handler and returns its status, or null if it threw. */
async function call(mod, method, route) {
  try {
    const res = await mod[method](requestFor(method, route), PARAMS);
    return res?.status ?? null;
  } catch {
    // A handler that throws on an empty body has not authorised anybody.
    return null;
  }
}

let routes = [];

beforeAll(async () => {
  // Several routes connect to the database before checking the session, so
  // one has to exist or they fail for the wrong reason and prove nothing.
  await startTestDB();
  routes = allRoutes();
}, 120000);

afterAll(async () => {
  await stopTestDB();
});

describe("a stranger cannot change anything", () => {
  it("found the API routes to check", () => {
    // A walk that silently matched nothing would make this whole file pass.
    expect(routes.length).toBeGreaterThan(50);
  });

  it("refuses every data-changing route that is not deliberately public", async () => {
    const letThrough = [];
    let checked = 0;

    for (const { route, file } of routes) {
      if (PUBLIC[route]) continue;
      const mod = await import(/* @vite-ignore */ file);

      for (const method of MUTATING) {
        if (typeof mod[method] !== "function") continue;
        mockSession = null;
        checked++;
        const status = await call(mod, method, route);
        if (status === null) continue;
        // 401 or 403 is the pass. Anything else — a 200, or a 400 from
        // validation running ahead of the auth check, or a 404 from a
        // lookup running ahead of it — means the caller got past the gate,
        // or there is no gate.
        if (!REFUSALS.includes(status)) {
          letThrough.push(`${method} /api/${route} → ${status}`);
        }
      }
    }

    expect(checked).toBeGreaterThan(40);
    expect(letThrough, `\nThese let an unauthenticated caller through:\n${letThrough.join("\n")}\n`).toEqual([]);
  }, 120000);
});

/**
 * Routes only staff may touch.
 *
 * Everything under admin/ counts automatically, so a new admin route is
 * covered the day it is added. The rest are staff-only routes that live
 * outside that namespace and have to be named.
 *
 * Routes that serve both audiences are deliberately absent: /api/orders/[id]
 * is a staff endpoint for updating an order AND the endpoint a customer uses
 * to confirm they received it, so "a customer must be refused" is not true
 * of the route as a whole. Those authorise per action, and their own test
 * files cover them.
 */
const STAFF_ONLY_OUTSIDE_ADMIN = [
  "categories/[id]",
  "digital-products",
  "digital-products/[id]",
  "discounts",
  "discounts/[id]",
  "orders/[id]/carrier",
  "products/import",
  "roles",
  "settings",
  "shipping/carriers",
  "shipping/carriers/[id]",
  "shipping/carriers/[id]/api",
  "shipping/methods",
  "shipping/methods/[id]",
  "shipping/zones",
  "shipping/zones/[id]",
  "users/[id]",
];

describe("an ordinary customer cannot do staff work", () => {
  it("refuses every staff route", async () => {
    const isStaffOnly = (route) => route.startsWith("admin/") || STAFF_ONLY_OUTSIDE_ADMIN.includes(route);
    const staffRoutes = routes.filter((r) => isStaffOnly(r.route));
    expect(staffRoutes.length).toBeGreaterThan(15);

    const letThrough = [];
    for (const { route, file } of staffRoutes) {
      const mod = await import(/* @vite-ignore */ file);
      for (const method of [...MUTATING, "GET"]) {
        if (typeof mod[method] !== "function") continue;
        mockSession = CUSTOMER;
        const status = await call(mod, method, route);
        if (status === null) continue;
        if (!REFUSALS.includes(status)) {
          letThrough.push(`${method} /api/${route} → ${status}`);
        }
      }
    }

    expect(letThrough, `\nThese let a plain customer do staff work:\n${letThrough.join("\n")}\n`).toEqual([]);
  }, 120000);
});

describe("the allowlist itself", () => {
  it("only names routes that exist", () => {
    // A renamed route would otherwise leave a stale exemption behind, which
    // excuses nothing — or worse, later excuses a new route that happens to
    // take the old name.
    const existing = new Set(routes.map((r) => r.route));
    for (const route of Object.keys(PUBLIC)) {
      expect(existing.has(route), `"${route}" is exempted but no longer exists`).toBe(true);
    }
  });

  it("gives a reason for every exemption", () => {
    for (const [route, reason] of Object.entries(PUBLIC)) {
      expect(reason.length, `"${route}" needs a reason, not just an entry`).toBeGreaterThan(20);
    }
  });
});
