// scripts/reconcile-leaked-stock.js
//
// Returns inventory that was reserved by online-payment orders which never
// completed, from before the automatic stock-release fix existed.
//
// Background: stock is decremented when an order is created. Until the
// `stockReleased` fix, a failed SSLCommerz payment left that stock
// permanently consumed — products showed as out of stock with no real
// order behind them. New failures now release stock automatically; this
// script cleans up the backlog that accumulated beforehand.
//
// SAFETY
//   * Dry run by default — prints exactly what it would do and writes
//     nothing. Pass --apply to actually commit the changes.
//   * Idempotent — every order it fixes is marked `stockReleased: true`,
//     so running it twice never credits the same units back twice.
//   * Skips orders whose stock was already returned by another path
//     (cancelled / returned orders), which would otherwise double-credit.
//
// USAGE
//   node scripts/reconcile-leaked-stock.js                  # dry run, failed payments only
//   node scripts/reconcile-leaked-stock.js --apply          # commit those changes
//   node scripts/reconcile-leaked-stock.js --include-abandoned --older-than-hours=24
//   node scripts/reconcile-leaked-stock.js --include-abandoned --apply
//
//   --include-abandoned  also release stock held by online-payment orders
//                        still sitting at paymentStatus "pending" (customer
//                        closed the tab and no postback ever arrived, so
//                        they hold stock indefinitely too).
//   --older-than-hours=N how old an abandoned pending order must be before
//                        it's considered dead. Default 24. Only applies to
//                        --include-abandoned; failed payments are always
//                        safe to release regardless of age.
//
// Requires MONGODB_URI in the environment (reads .env.local automatically).

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Minimal .env.local loader — avoids adding a "dotenv" dependency just for
// this one-off script, matching scripts/migrate-order-status.js.
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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const INCLUDE_ABANDONED = args.includes("--include-abandoned");
const olderThanArg = args.find((a) => a.startsWith("--older-than-hours="));
const OLDER_THAN_HOURS = olderThanArg ? Number(olderThanArg.split("=")[1]) : 24;

if (Number.isNaN(OLDER_THAN_HOURS) || OLDER_THAN_HOURS < 0) {
  console.error("--older-than-hours must be a non-negative number");
  process.exit(1);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set — check your .env.local");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const orders = db.collection("orders");
  const products = db.collection("products");
  const discounts = db.collection("discounts");

  // Orders whose stock is still reserved but whose payment never completed.
  //
  // orderStatus is excluded for cancelled/returned because those flows
  // already returned the stock themselves (without setting the flag, since
  // it didn't exist yet) — releasing again would double-credit.
  const conditions = [{ paymentStatus: "failed" }];
  if (INCLUDE_ABANDONED) {
    conditions.push({
      paymentStatus: "pending",
      paymentMethod: "sslcommerz",
      createdAt: { $lte: new Date(Date.now() - OLDER_THAN_HOURS * 60 * 60 * 1000) },
    });
  }

  const query = {
    $or: conditions,
    stockReleased: { $ne: true },
    orderStatus: { $nin: ["cancelled", "returned", "shipped", "delivered"] },
  };

  const stuck = await orders.find(query).toArray();

  console.log(`\nMode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no changes will be written)"}`);
  console.log(`Scope: failed payments${INCLUDE_ABANDONED ? ` + abandoned pending orders older than ${OLDER_THAN_HOURS}h` : ""}`);
  console.log(`Found ${stuck.length} order(s) holding stock that should be released.\n`);

  if (stuck.length === 0) {
    await mongoose.disconnect();
    console.log("Nothing to do.");
    return;
  }

  // Tally what would be returned, per product/variant, so the output is
  // reviewable before committing.
  const tally = new Map();
  const couponTally = new Map();

  for (const order of stuck) {
    for (const item of order.items || []) {
      const key = `${item.product}::${item.combinationKey || ""}`;
      tally.set(key, (tally.get(key) || 0) + item.quantity);
    }
    if (order.discountCode) {
      couponTally.set(order.discountCode, (couponTally.get(order.discountCode) || 0) + 1);
    }
    console.log(
      `  ${order.orderNumber || order._id}  ${order.paymentStatus.padEnd(8)}  ${new Date(order.createdAt).toISOString().slice(0, 10)}  ${(order.items || []).length} item(s)`
    );
  }

  console.log(`\nStock to return (${tally.size} product/variant line(s)):`);
  for (const [key, qty] of tally) {
    const [productId, combinationKey] = key.split("::");
    const product = await products.findOne({ _id: new mongoose.Types.ObjectId(productId) }, { projection: { name: 1 } });
    const label = product ? product.name : `(deleted product ${productId})`;
    console.log(`  +${String(qty).padStart(4)}  ${label}${combinationKey ? ` [${combinationKey}]` : ""}`);
  }

  if (couponTally.size) {
    console.log(`\nCoupon usage to release:`);
    for (const [code, count] of couponTally) console.log(`  -${count}  ${code}`);
  }

  if (!APPLY) {
    await mongoose.disconnect();
    console.log(`\nDry run complete — nothing was written.`);
    console.log(`Re-run with --apply to commit these changes.`);
    return;
  }

  // ---- commit ----
  let restoredLines = 0;
  let skippedDeleted = 0;

  for (const [key, qty] of tally) {
    const [productId, combinationKey] = key.split("::");
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(productId);
    } catch {
      skippedDeleted++;
      continue;
    }

    if (combinationKey) {
      const res = await products.updateOne(
        { _id: objectId, "combinations.key": combinationKey },
        { $inc: { "combinations.$.stock": qty } }
      );
      if (res.matchedCount === 0) skippedDeleted++;
      else restoredLines++;
    } else {
      const res = await products.updateOne({ _id: objectId }, { $inc: { stock: qty } });
      if (res.matchedCount === 0) skippedDeleted++;
      else restoredLines++;
    }
  }

  for (const [code, count] of couponTally) {
    // guard so usedCount can never be driven negative
    for (let i = 0; i < count; i++) {
      await discounts.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    }
  }

  const ids = stuck.map((o) => o._id);
  await orders.updateMany(
    { _id: { $in: ids } },
    {
      $set: { stockReleased: true },
      $push: {
        activity: {
          type: "status_changed",
          message: "Reserved stock returned to inventory (reconciliation script)",
          by: { id: null, name: "System" },
          at: new Date(),
        },
      },
    }
  );

  console.log(`\nDone.`);
  console.log(`  ${restoredLines} product/variant line(s) restored.`);
  if (skippedDeleted) console.log(`  ${skippedDeleted} line(s) skipped (product or variant no longer exists).`);
  console.log(`  ${ids.length} order(s) marked stockReleased so they're never double-credited.`);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Reconciliation failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
