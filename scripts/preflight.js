// scripts/preflight.js
//
// Run before going live:   npm run preflight
//
// Checks the things that can't be caught by a build — environment config
// and the production database — and tells you exactly what to fix.
// Exits with code 1 if anything blocking is found, so it can also gate a
// deploy script / CI step.

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

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

const results = { fail: [], warn: [], ok: [] };
const fail = (m) => results.fail.push(m);
const warn = (m) => results.warn.push(m);
const ok = (m) => results.ok.push(m);

const env = process.env;

function checkEnv() {
  // --- database
  if (!env.MONGODB_URI) fail("MONGODB_URI is not set.");
  else if (/localhost|127\.0\.0\.1/.test(env.MONGODB_URI)) warn("MONGODB_URI points at localhost — is that really your production database?");
  else ok("MONGODB_URI is set.");

  // --- auth secret
  const secret = env.NEXTAUTH_SECRET || "";
  if (!secret) fail("NEXTAUTH_SECRET is not set — sessions won't work in production.");
  else if (secret.length < 32) fail(`NEXTAUTH_SECRET is only ${secret.length} characters. Use 32+ random characters (openssl rand -base64 32).`);
  else if (/secret|test|dev|change|example|123/i.test(secret)) fail("NEXTAUTH_SECRET looks like a placeholder/dev value. Generate a fresh one: openssl rand -base64 32");
  else ok("NEXTAUTH_SECRET is set and long enough.");

  // --- public URL
  const url = env.NEXTAUTH_URL || "";
  if (!url) fail("NEXTAUTH_URL is not set — login redirects and emailed links will break.");
  else if (/localhost|127\.0\.0\.1/.test(url)) fail(`NEXTAUTH_URL is ${url} — set it to your real domain (e.g. https://yourstore.com).`);
  else if (!url.startsWith("https://")) fail(`NEXTAUTH_URL should use https:// (got ${url}).`);
  else ok(`NEXTAUTH_URL is ${url}.`);

  // --- payment credential encryption key
  if (!env.PAYMENT_ENCRYPTION_KEY) {
    warn(
      "PAYMENT_ENCRYPTION_KEY is not set, so payment credentials are encrypted with NEXTAUTH_SECRET. " +
        "If you ever rotate NEXTAUTH_SECRET, every saved gateway credential becomes unreadable. " +
        "Set a separate, permanent key: openssl rand -base64 32"
    );
  } else if (env.PAYMENT_ENCRYPTION_KEY === env.NEXTAUTH_SECRET) {
    warn("PAYMENT_ENCRYPTION_KEY is the same as NEXTAUTH_SECRET — use a separate value so the two can be rotated independently.");
  } else {
    ok("PAYMENT_ENCRYPTION_KEY is set separately.");
  }

  // --- images
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    warn("Cloudinary isn't fully configured — admins won't be able to upload product images.");
  } else ok("Cloudinary is configured.");

  // --- node env
  if (env.NODE_ENV && env.NODE_ENV !== "production") {
    warn(`NODE_ENV is "${env.NODE_ENV}". Production should run with NODE_ENV=production (npm run build && npm start sets this).`);
  }
}

async function checkDatabase() {
  if (!env.MONGODB_URI) return;
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    fail(`Couldn't connect to MongoDB: ${err.message}`);
    return;
  }
  const db = mongoose.connection.db;

  // --- replica set (needed for checkout transactions)
  try {
    const hello = await db.admin().command({ hello: 1 });
    if (hello.setName || hello.msg === "isdbgrid") {
      ok(`MongoDB supports transactions (${hello.setName ? `replica set "${hello.setName}"` : "sharded cluster"}).`);
    } else {
      warn(
        "MongoDB is a standalone server, which can't run transactions. Checkout still works and still " +
          "prevents overselling, but loses all-or-nothing rollback across stock/coupon/order. " +
          "MongoDB Atlas is a replica set by default; on your own server, run mongod as a replica set."
      );
    }
  } catch (err) {
    warn(`Couldn't determine MongoDB topology: ${err.message}`);
  }

  // --- an admin must exist or nobody can reach /admin
  try {
    const admins = await db.collection("users").countDocuments({ role: "admin" });
    if (admins === 0) {
      fail(
        "No admin account exists, so nobody can open /admin. Create one: " +
          "npm run create-admin -- --email=you@example.com --name=\"Your Name\" --password='...'"
      );
    } else ok(`${admins} admin account(s) found.`);
  } catch (err) {
    warn(`Couldn't check for admin accounts: ${err.message}`);
  }

  // --- store settings stored in the DB
  try {
    const settings = await db.collection("settings").findOne({});
    const ssl = settings?.payment?.sslcommerz;
    const cod = settings?.payment?.cod;
    const codOn = cod ? cod.enabled !== false : true;
    const sslOn = !!ssl?.enabled;

    if (!codOn && !sslOn && env.SSLCOMMERZ_IS_LIVE !== "true") {
      fail("No payment method is enabled — customers can't check out. Enable one in Admin → Settings → Payment Methods.");
    }
    if (sslOn) {
      if (ssl.mode !== "live") {
        warn('SSLCommerz is enabled in SANDBOX mode — real customers can\'t pay. Switch it to "live" with your live store credentials.');
      } else ok("SSLCommerz is enabled in live mode.");
    } else if (env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_IS_LIVE !== "true") {
      warn("SSLCommerz env credentials are set but SSLCOMMERZ_IS_LIVE isn't \"true\" — payments would go to the sandbox.");
    }
    if (codOn) ok("Cash on Delivery is enabled.");

    const emailOn = settings?.email?.enabled && settings?.email?.smtpHost;
    if (emailOn || env.SMTP_HOST) {
      ok("Email is configured.");
    } else {
      fail(
        "Email isn't configured. Password-reset links and order emails can't be delivered — customers " +
          "who forget their password will be locked out. Set it up in Admin → Settings → Email Notifications."
      );
    }
  } catch (err) {
    warn(`Couldn't read store settings: ${err.message}`);
  }

  // --- leaked stock from failed payments
  try {
    const leaked = await db.collection("orders").countDocuments({
      paymentStatus: "failed",
      stockReleased: { $ne: true },
      orderStatus: { $nin: ["cancelled", "returned", "shipped", "delivered"] },
    });
    if (leaked > 0) {
      warn(`${leaked} failed-payment order(s) are still holding stock. Release it: npm run reconcile:stock (dry run), then add --apply.`);
    } else ok("No failed-payment orders are holding stock.");
  } catch {}

  await mongoose.disconnect();
}

(async () => {
  console.log("\nPre-launch check\n================\n");
  checkEnv();
  await checkDatabase();

  for (const m of results.ok) console.log(`  ✓ ${m}`);
  if (results.warn.length) console.log("");
  for (const m of results.warn) console.log(`  ⚠ ${m}`);
  if (results.fail.length) console.log("");
  for (const m of results.fail) console.log(`  ✗ ${m}`);

  console.log(
    `\n${results.fail.length} blocking, ${results.warn.length} warning(s), ${results.ok.length} passed.`
  );
  if (results.fail.length) {
    console.log("Fix the ✗ items before going live.\n");
    process.exit(1);
  }
  console.log(results.warn.length ? "Ready to launch — review the ⚠ items.\n" : "Ready to launch.\n");
})().catch(async (err) => {
  console.error("Preflight crashed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
