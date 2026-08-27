// tests/upload.test.js
import { describe, it, expect, vi } from "vitest";

let mockSession = null;
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
// getRolePermissions falls back to DEFAULT_ROLE_PERMISSIONS when there's no
// DB connection (see lib/rbac.js) — no mongodb-memory-server needed here.

const { POST } = await import("@/app/api/upload/route");

function makeFormDataRequest({ hasFile = true, kind = "image" } = {}) {
  const form = new FormData();
  if (hasFile) {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
    form.append("file", blob, "test.jpg");
  }
  form.append("kind", kind);
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

describe("upload authorization", () => {
  it("rejects an unauthenticated request", async () => {
    mockSession = null;
    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(401);
  });

  it("rejects Support staff (no 'products' or 'settings' permission)", async () => {
    mockSession = { user: { id: "1", role: "support" } };
    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(403);
  });

  it("rejects Order Processing staff (no 'products' or 'settings' permission)", async () => {
    mockSession = { user: { id: "1", role: "order_processing" } };
    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(403);
  });

  it("rejects a customer account entirely", async () => {
    mockSession = { user: { id: "1", role: "customer" } };
    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(403);
  });

  it("lets Editor staff (has 'products') past the authorization gate", async () => {
    mockSession = { user: { id: "1", role: "editor" } };
    const res = await POST(makeFormDataRequest());
    // should get past the 401/403 checks — whatever happens next depends
    // on Cloudinary env config in this test environment, but it must not
    // be an authorization rejection
    expect([401, 403]).not.toContain(res.status);
  });

  it("lets Admin past the authorization gate for digital uploads too", async () => {
    mockSession = { user: { id: "1", role: "admin" } };
    const res = await POST(makeFormDataRequest({ kind: "digital" }));
    expect([401, 403]).not.toContain(res.status);
  });
});
