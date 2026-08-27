// tests/rbac.test.js
import { describe, it, expect } from "vitest";
import { hasPermission } from "@/lib/rbac";

// No DB connection is established in this suite on purpose — getRolePermissions
// falls back to DEFAULT_ROLE_PERMISSIONS when the RoleConfig lookup throws,
// which lets us verify the *default* permission set (the RBAC fix's actual
// concern) without needing a live database.
function sessionFor(role) {
  return { user: { id: "000000000000000000000000", role } };
}

describe("upload authorization (RBAC, not broad role checks)", () => {
  it("Support staff do NOT have 'products' or 'settings' by default", async () => {
    const session = sessionFor("support");
    expect(await hasPermission(session, "products")).toBe(false);
    expect(await hasPermission(session, "settings")).toBe(false);
  });

  it("Order Processing staff do NOT have 'products' or 'settings' by default", async () => {
    const session = sessionFor("order_processing");
    expect(await hasPermission(session, "products")).toBe(false);
    expect(await hasPermission(session, "settings")).toBe(false);
  });

  it("Editor staff DO have 'products' (can manage product images/digital assets)", async () => {
    const session = sessionFor("editor");
    expect(await hasPermission(session, "products")).toBe(true);
  });

  it("Admin has every permission, including 'products' and 'settings'", async () => {
    const session = sessionFor("admin");
    expect(await hasPermission(session, "products")).toBe(true);
    expect(await hasPermission(session, "settings")).toBe(true);
  });

  it("an unauthenticated session has no permissions at all", async () => {
    expect(await hasPermission(null, "products")).toBe(false);
    expect(await hasPermission({}, "products")).toBe(false);
  });
});
