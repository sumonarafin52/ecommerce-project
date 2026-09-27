// scripts/create-admin.js
//
// Creates (or promotes) an admin account.
//
// Why this exists: registration always assigns role "customer", and no
// other code path grants admin. On a fresh production database that means
// nobody can reach /admin at all — the only alternative is hand-editing
// MongoDB. Run this once after deploying.
//
// USAGE
//   node scripts/create-admin.js --email=you@example.com --name="Your Name" --password='ChooseAStrongOne1!'
//   node scripts/create-admin.js --email=existing@example.com --promote
//
//   --promote   promote an existing account to admin instead of creating
//               a new one (no password needed)
//
// Requires MONGODB_URI in the environment (reads .env.local automatically).

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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
function arg(name) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : null;
}
const PROMOTE = args.includes("--promote");
const email = (arg("email") || "").trim().toLowerCase();
const name = arg("name") || "Administrator";
const password = arg("password");

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not set — check your .env.local");
    process.exit(1);
  }
  if (!email) {
    console.error("Missing --email=you@example.com");
    process.exit(1);
  }
  if (!PROMOTE && !password) {
    console.error("Missing --password='...'  (or pass --promote to upgrade an existing account)");
    process.exit(1);
  }
  if (!PROMOTE && password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.db.collection("users");

  const existing = await users.findOne({ email });

  if (existing) {
    if (existing.role === "admin") {
      console.log(`${email} is already an admin — nothing to do.`);
    } else {
      await users.updateOne({ _id: existing._id }, { $set: { role: "admin" } });
      console.log(`Promoted existing account ${email} to admin.`);
    }
  } else {
    if (PROMOTE) {
      console.error(`No account found for ${email}. Register it first, or drop --promote to create one.`);
      await mongoose.disconnect();
      process.exit(1);
    }
    // cost 12, matching the registration endpoint
    const hashed = await bcrypt.hash(password, 12);
    await users.insertOne({
      name,
      email,
      password: hashed,
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created admin account ${email}.`);
  }

  console.log("\nSign in at /login, then open /admin.");
  if (!PROMOTE && password) {
    console.log("Change this password after your first sign-in (Profile → Settings).");
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
