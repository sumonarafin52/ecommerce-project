// tests/productSlug.test.js
//
// Readable product URLs.
//
// The cases that matter are the ones that quietly break a shop's search
// traffic: two products fighting over one slug, a Bengali product name
// slugifying to nothing, and — most of all — the URLs already indexed or
// shared continuing to work after the change.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import User from "@/models/User";

let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
let permitted = true;
vi.mock("@/lib/rbac", () => ({ hasPermission: vi.fn(async () => permitted) }));
vi.mock("@/lib/inventoryEvents", () => ({ notifyBackInStock: vi.fn(async () => {}) }));

const productsRoute = await import("@/app/api/products/route");
const productRoute = await import("@/app/api/products/[id]/route");
const { slugify, productPath, isObjectId } = await import("@/lib/slug");
const { resolveSlug, backfillProductSlugs } = await import("@/lib/productSlug");
const { productFilter, canonicalRedirect } = await import("@/lib/productLookup");

const create = (body) =>
  productsRoute.POST(
    new Request("http://x/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const update = (id, body) =>
  productRoute.PUT(
    new Request(`http://x/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id: String(id) } }
  );

const read = (param) =>
  productRoute.GET(new Request(`http://x/api/products/${param}`), { params: { id: String(param) } });

const BASE = { category: "Home", price: 450 };

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  permitted = true;
  const admin = await User.create({ name: "Admin", email: "a@test.com", password: "x".repeat(20), role: "admin" });
  mockSession = { user: { id: String(admin._id), name: "Admin", role: "admin" } };
});

describe("turning a name into a URL", () => {
  it("makes a readable slug from an ordinary name", () => {
    expect(slugify("Ceramic Mug")).toBe("ceramic-mug");
    expect(slugify("  Nike Air Max 270  ")).toBe("nike-air-max-270");
    expect(slugify("Men's T-Shirt")).toBe("mens-t-shirt");
  });

  it("keeps the meaning of characters a stripper would throw away", () => {
    // "A&W" becoming "aw" loses the word; "café" becoming "caf" loses a letter
    expect(slugify("Salt & Pepper Set")).toBe("salt-and-pepper-set");
    expect(slugify("Café Latte Mug")).toBe("cafe-latte-mug");
  });

  it("transliterates Bengali instead of deleting it", () => {
    // This is the case that matters here: a shop in Bangladesh naming
    // products in Bengali. Stripping non-Latin characters would give every
    // such product an empty slug, so they'd all collide and end up as
    // product-2, product-3, … with no keyword in the URL at all.
    const slug = slugify("চায়ের কাপ");
    expect(slug).not.toBe("");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("returns nothing for a name with nothing usable in it", () => {
    // "" is the honest answer — the caller then falls back to the id rather
    // than every emoji-named product becoming "product".
    expect(slugify("🎉🎉🎉")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify(null)).toBe("");
  });

  it("keeps a very long name short, cutting on a word", () => {
    const slug = slugify("A Genuinely Enormous Product Title That Simply Refuses To Stop Going On And On Forever");
    expect(slug.length).toBeLessThanOrEqual(70);
    expect(slug.endsWith("-")).toBe(false);
    // not cut mid-word
    expect(slug.split("-").at(-1)).toMatch(/^(a|genuinely|enormous|product|title|that|simply|refuses|to|stop|going|on|and|forever)$/);
  });
});

describe("two products with the same name", () => {
  it("gives the second one a numbered slug rather than failing", async () => {
    const a = await create({ ...BASE, name: "Ceramic Mug" });
    const b = await create({ ...BASE, name: "Ceramic Mug" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const slugs = (await Product.find().select("slug").lean()).map((p) => p.slug).sort();
    expect(slugs).toEqual(["ceramic-mug", "ceramic-mug-2"]);
  });

  it("never lets two products share a slug, even asked to", async () => {
    await create({ ...BASE, name: "Ceramic Mug" });
    await create({ ...BASE, name: "Something Else", slug: "ceramic-mug" });
    const slugs = (await Product.find().select("slug").lean()).map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps a product's own slug when it is saved again", async () => {
    const created = await (await create({ ...BASE, name: "Ceramic Mug" })).json();
    const id = created.data._id;

    // Saving repeatedly used to be the trap: the product sees its own slug
    // as taken and walks to -2, -3, -4, breaking the link each time.
    for (let i = 0; i < 3; i++) await update(id, { stock: 5 + i, slug: "ceramic-mug" });

    expect((await Product.findById(id)).slug).toBe("ceramic-mug");
  });
});

describe("staff editing the URL", () => {
  it("cleans up whatever they type", async () => {
    const created = await (await create({ ...BASE, name: "Mug", slug: "  My Custom URL!  " })).json();
    expect(created.data.slug).toBe("my-custom-url");
  });

  it("leaves the URL alone when the product is renamed", async () => {
    // Renaming is the common case (a typo fix, a better title). Moving the
    // URL with it would break every link already shared for a cosmetic edit.
    const created = await (await create({ ...BASE, name: "Ceramic Mug" })).json();
    await update(created.data._id, { name: "Ceramic Mug — Blue" });
    expect((await Product.findById(created.data._id)).slug).toBe("ceramic-mug");
  });

  it("clearing the field keeps the existing URL rather than deleting it", async () => {
    const created = await (await create({ ...BASE, name: "Ceramic Mug" })).json();
    await update(created.data._id, { slug: "" });
    expect((await Product.findById(created.data._id)).slug).toBe("ceramic-mug");
  });
});

describe("links that already exist keep working", () => {
  it("finds a product by its id as well as its slug", async () => {
    const created = await (await create({ ...BASE, name: "Ceramic Mug" })).json();
    const id = created.data._id;

    expect((await (await read(id)).json()).data.name).toBe("Ceramic Mug");
    expect((await (await read("ceramic-mug")).json()).data.name).toBe("Ceramic Mug");
  });

  it("sends an id URL to the slug, and leaves the slug URL alone", async () => {
    const product = { _id: "6acb91104efd9ef5cf86bee3", slug: "ceramic-mug", status: "public" };
    expect(canonicalRedirect("6acb91104efd9ef5cf86bee3", product)).toBe("/products/ceramic-mug");
    expect(canonicalRedirect("ceramic-mug", product)).toBeNull();
    // a product with no slug yet has nowhere better to go
    expect(canonicalRedirect("6acb91104efd9ef5cf86bee3", { _id: "6acb91104efd9ef5cf86bee3", status: "public" })).toBeNull();
  });

  it("never redirects an unreleased product, which would name it in the Location header", () => {
    // A slug is made from the product's name, so redirecting a draft id
    // would confirm the product exists and tell anyone who guessed the id
    // what it is called.
    const id = "6acb91104efd9ef5cf86bee3";
    for (const status of ["draft", "private"]) {
      expect(canonicalRedirect(id, { _id: id, slug: "unreleased-winter-jacket", status })).toBeNull();
    }
    // unlisted is reachable by link, so canonicalising it is right
    expect(canonicalRedirect(id, { _id: id, slug: "secret-sale", status: "unlisted" })).toBe("/products/secret-sale");
  });

  it("never looks a slug up as an id or the other way round", () => {
    expect(productFilter("6acb91104efd9ef5cf86bee3")).toEqual({ _id: "6acb91104efd9ef5cf86bee3" });
    expect(productFilter("ceramic-mug")).toEqual({ slug: "ceramic-mug" });
    expect(productFilter("")).toBeNull();
    expect(isObjectId("ceramic-mug")).toBe(false);
  });

  it("404s a URL that matches nothing, instead of erroring", async () => {
    // A slug reaching findById used to be a CastError and a 500.
    expect((await read("no-such-product")).status).toBe(404);
    expect((await read("6acb91104efd9ef5cf86bee3")).status).toBe(404);
  });

  it("links to the id while a product has no slug yet", () => {
    expect(productPath({ _id: "6acb91104efd9ef5cf86bee3" })).toBe("/products/6acb91104efd9ef5cf86bee3");
    expect(productPath({ _id: "6acb91104efd9ef5cf86bee3", slug: "mug" })).toBe("/products/mug");
  });
});

describe("the existing catalogue", () => {
  it("gives every slug-less product a URL, without disturbing the ones that have one", async () => {
    // Products as they look before this change.
    await Product.collection.insertMany([
      { name: "Ceramic Mug", category: "Home", price: 450, status: "public" },
      { name: "Ceramic Mug", category: "Home", price: 500, status: "public" },
      { name: "Gel Pen", category: "Office", price: 50, status: "public", slug: "gel-pen-original" },
    ]);

    const filled = await backfillProductSlugs();
    expect(filled).toBe(2);

    const all = await Product.find().select("name slug").lean();
    const slugs = all.map((p) => p.slug);
    expect(slugs.every(Boolean)).toBe(true);
    expect(new Set(slugs).size).toBe(3);
    // an existing slug is never rewritten — that URL is already out there
    expect(all.find((p) => p.name === "Gel Pen").slug).toBe("gel-pen-original");
  });

  it("is safe to run twice", async () => {
    await Product.collection.insertOne({ name: "Ceramic Mug", category: "Home", price: 450, status: "public" });
    expect(await backfillProductSlugs()).toBe(1);
    expect(await backfillProductSlugs()).toBe(0);
    expect((await Product.findOne({ name: "Ceramic Mug" })).slug).toBe("ceramic-mug");
  });

  it("falls back to the id for a product whose name has no usable characters", async () => {
    const { insertedId } = await Product.collection.insertOne({
      name: "🎉",
      category: "Home",
      price: 10,
      status: "public",
    });
    await backfillProductSlugs();
    const p = await Product.findById(insertedId);
    expect(p.slug).toBeTruthy();
    expect(p.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("resolveSlug on its own", () => {
  it("does not count the product being edited as a collision", async () => {
    const p = await Product.create({ name: "Mug", category: "Home", price: 10, slug: "mug" });
    expect(await resolveSlug({ requested: "mug", name: "Mug", excludeId: p._id })).toBe("mug");
  });

  it("does count a different product as a collision", async () => {
    await Product.create({ name: "Mug", category: "Home", price: 10, slug: "mug" });
    const other = await Product.create({ name: "Other", category: "Home", price: 10, slug: "other" });
    expect(await resolveSlug({ requested: "mug", name: "Mug", excludeId: other._id })).toBe("mug-2");
  });
});

describe("the legacy-URL redirect middleware", () => {
  // The redirect lives in middleware because the product layout renders
  // inside app/products/loading.js's Suspense boundary, where a thrown
  // redirect can only become a client-side one — a 200 carrying the whole
  // page, which is the duplicate a crawler must not see.
  it("matches a product id and nothing else", async () => {
    const { config } = await import("@/middleware");
    const [pattern] = config.matcher;

    // The first version of this was "/products/:id", which Next compiles to
    // a regexp matching /products itself and NOT the segment below it — so
    // the redirect never ran and every old link stayed on a 200. The pattern
    // is pinned here because that failure is completely silent.
    expect(pattern).toBe("/products/:id([0-9a-fA-F]{24})");

    const asRegExp = new RegExp(`^${pattern.replace(/:id\(([^)]*)\)/, "($1)")}$`);
    expect(asRegExp.test("/products/6acb91104efd9ef5cf86bee3")).toBe(true);
    expect(asRegExp.test("/products/ceramic-mug")).toBe(false);
    expect(asRegExp.test("/products")).toBe(false);
  });

  it("only answers with a slug for a product a visitor could open", async () => {
    const { GET } = await import("@/app/api/products/[id]/canonical/route");
    const call = (id) => GET(new Request(`http://x/api/products/${id}/canonical`), { params: { id: String(id) } });

    const open = await Product.create({ name: "Ceramic Mug", category: "Home", price: 10, slug: "ceramic-mug", status: "public" });
    const hidden = await Product.create({ name: "Secret", category: "Home", price: 10, slug: "secret", status: "draft" });

    expect((await (await call(open._id)).json()).slug).toBe("ceramic-mug");

    // A draft must not even confirm the id exists, let alone name it.
    const res = await call(hidden._id);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/secret/i);

    // a slug has no business here — it is already canonical
    expect((await call("ceramic-mug")).status).toBe(404);
  });
});

describe("the Suspense boundary the product page sits under", () => {
  // A loading.js at app/products/ wraps /products/[id] as well as the
  // listing. Inside that boundary the shell is flushed before the detail
  // layout runs, so notFound() and permanentRedirect() there can no longer
  // set a status — a dead product URL answers 200 with "Product not found",
  // and a legacy id URL answers 200 with the whole page.
  //
  // The listing's skeleton therefore lives in the (listing) route group,
  // which serves the same /products URL but covers only that page. This
  // guards the arrangement, because putting the file back would break the
  // status codes without failing anything else.
  it("keeps the listing's loading.js out of the detail route's way", async () => {
    const { existsSync } = await import("node:fs");

    expect(existsSync("app/products/loading.js"), "a loading.js directly under app/products/ puts /products/[id] back inside a Suspense boundary").toBe(false);
    // the skeleton still exists, scoped to the listing
    expect(existsSync("app/products/(listing)/loading.js")).toBe(true);
    expect(existsSync("app/products/(listing)/page.js")).toBe(true);
  });
});
