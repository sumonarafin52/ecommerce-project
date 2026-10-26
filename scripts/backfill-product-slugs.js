// scripts/backfill-product-slugs.js
//
// Gives every existing product a readable URL slug.
//
// Products created before slugs existed have none, so they keep living at
// /products/6acb91104efd9ef5cf86bee3. New products get a slug automatically;
// this is what brings the existing catalogue across.
//
// Safe to run more than once: it only touches products that have no slug,
// and never changes one that is already set — so a product whose URL is
// already out in the world keeps it.
//
// Usage:
//   node scripts/backfill-product-slugs.js            # do it
//   node scripts/backfill-product-slugs.js --dry-run  # just show what it would do
//
// Requires MONGODB_URI in the environment (reads .env.local automatically).

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Minimal .env.local loader — same approach as the other scripts here,
// rather than adding a dotenv dependency for a one-off.
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

// The slug rules live in lib/slug.js so the app and this script can never
// disagree about what a name turns into. That file is an ES module and this
// script is CommonJS, so it's loaded with a dynamic import.
async function loadSlugify() {
  const mod = await import(path.resolve(__dirname, "../lib/slug.js"));
  return mod.slugify;
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set — check your .env.local");
    process.exit(1);
  }

  const slugify = await loadSlugify();
  await mongoose.connect(uri);
  const products = mongoose.connection.db.collection("products");

  const pending = await products
    .find({ $or: [{ slug: { $exists: false } }, { slug: "" }, { slug: null }] })
    .project({ _id: 1, name: 1 })
    .toArray();

  console.log(`${pending.length} product(s) without a slug.`);
  if (!pending.length) {
    await mongoose.disconnect();
    return;
  }

  // Slugs already in use, so the run doesn't collide with products that
  // were given one earlier.
  const taken = new Set(
    (await products.find({ slug: { $type: "string", $ne: "" } }).project({ slug: 1 }).toArray()).map((p) => p.slug)
  );

  let filled = 0;
  for (const product of pending) {
    const base = slugify(product.name) || String(product._id);
    let slug = base;
    // Two products genuinely can share a name, so the second gets -2.
    for (let i = 2; taken.has(slug) && i <= 50; i++) slug = `${base}-${i}`;
    if (taken.has(slug)) slug = `${base}-${String(product._id).slice(-6)}`;

    console.log(`  ${product.name} → /products/${slug}`);
    if (!dryRun) {
      try {
        await products.updateOne({ _id: product._id }, { $set: { slug } });
        filled++;
      } catch (err) {
        if (err?.code === 11000) {
          console.warn(`  ! "${slug}" was taken by another process — skipped, re-run to pick it up`);
          continue;
        }
        throw err;
      }
    }
    taken.add(slug);
  }

  console.log(dryRun ? `\nDry run — nothing written.` : `\nDone. ${filled} product(s) updated.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
