// tests/compare.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";

const { GET } = await import("@/app/api/products/compare/route");
const get = (ids) => GET(new Request(`http://localhost/api/products/compare?ids=${ids}`)).then((r) => r.json());
let n = 0;
const make = (o = {}) => Product.create({ name: `P${++n}`, slug: `p-${n}-${Date.now()}`, price: 100, category: "C", stock: 3, status: "public", ...o });

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => { await clearTestDB(); });

describe("compare endpoint", () => {
  it("returns products in the order the customer added them", async () => {
    const a = await make(); const b = await make(); const c = await make();
    const res = await get([c._id, a._id, b._id].join(","));
    expect(res.data.map((p) => String(p._id))).toEqual([c, a, b].map((p) => String(p._id)));
  });

  it("never returns draft or private products", async () => {
    const pub = await make(); const draft = await make({ status: "draft" }); const priv = await make({ status: "private" });
    const res = await get([pub._id, draft._id, priv._id].join(","));
    expect(res.data).toHaveLength(1);
    expect(String(res.data[0]._id)).toBe(String(pub._id));
  });

  it("caps at 4 products", async () => {
    const ps = [];
    for (let i = 0; i < 6; i++) ps.push(await make());
    const res = await get(ps.map((p) => p._id).join(","));
    expect(res.data).toHaveLength(4);
  });

  it("ignores malformed ids instead of erroring", async () => {
    const a = await make();
    const res = await get(`${a._id},not-an-id,{"$gt":""}`);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
  });
});
