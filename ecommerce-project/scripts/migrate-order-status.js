// scripts/migrate-order-status.js
//
// One-time migration for the orderStatus enum expansion (4 values ->
// pending/processing/on_hold/shipped/delivered/cancelled/returned).
//
// The enum itself only grew — every existing value ("processing", "shipped",
// "delivered", "cancelled") is still valid, so no document needs touching
// for that alone. The only real migration needed is folding the old
// standalone `onHold` boolean into the new orderStatus="on_hold" + previousStatus
// scheme.
//
// Safe to run more than once — orders already migrated (orderStatus already
// "on_hold", or onHold was never true) are left untouched.
//
// Usage:
//   node scripts/migrate-order-status.js
//
// Requires MONGODB_URI in the environment (reads from .env.local automatically).

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Minimal .env.local loader — avoids adding a "dotenv" dependency just for
// this one-off script. Next.js already loads .env.local itself for the app;
// this mirrors that for a standalone `node scripts/...` run.
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

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set — check your .env.local");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const orders = db.collection("orders");

  // Orders that were on hold under the old boolean scheme and haven't
  // already been migrated.
  const toMigrate = await orders
    .find({ onHold: true, orderStatus: { $ne: "on_hold" } })
    .toArray();

  console.log(`Found ${toMigrate.length} order(s) to migrate.`);

  let migrated = 0;
  for (const order of toMigrate) {
    await orders.updateOne(
      { _id: order._id },
      {
        $set: {
          previousStatus: order.orderStatus, // remember the stage it was in
          orderStatus: "on_hold",
          holdReason: order.holdReason || "",
        },
      }
    );
    migrated++;
  }

  console.log(`Migrated ${migrated} order(s).`);

  // The old `onHold` field is no longer read anywhere in the app — this
  // just removes it from every document so it doesn't linger as dead data.
  // Comment this block out if you'd rather keep it for a while as a backup.
  const cleanup = await orders.updateMany({ onHold: { $exists: true } }, { $unset: { onHold: "" } });
  console.log(`Removed legacy 'onHold' field from ${cleanup.modifiedCount} order(s).`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
