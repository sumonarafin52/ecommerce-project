// tests/createAdmin.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;
let uri;
let db;

const SCRIPT = path.resolve(process.cwd(), "scripts/create-admin.js");

function runScript(args = [], expectFailure = false) {
  try {
    return execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, MONGODB_URI: uri },
    });
  } catch (err) {
    if (expectFailure) return (err.stdout || "") + (err.stderr || "");
    throw err;
  }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  uri = mongod.getUri();
  await mongoose.connect(uri);
  db = mongoose.connection.db;
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await db.collection("users").deleteMany({});
});

describe("create-admin script", () => {
  it("creates a new admin account with a usable password hash", async () => {
    runScript(["--email=boss@example.com", "--name=Boss", "--password=StrongPass1!"]);

    const user = await db.collection("users").findOne({ email: "boss@example.com" });
    expect(user).toBeTruthy();
    expect(user.role).toBe("admin");
    expect(user.name).toBe("Boss");
    // password must actually verify — a broken hash would lock them out
    expect(await bcrypt.compare("StrongPass1!", user.password)).toBe(true);
  });

  it("promotes an existing customer account instead of duplicating it", async () => {
    await db.collection("users").insertOne({
      name: "Existing",
      email: "existing@example.com",
      password: await bcrypt.hash("whatever1!", 12),
      role: "customer",
    });

    runScript(["--email=existing@example.com", "--promote"]);

    const all = await db.collection("users").find({ email: "existing@example.com" }).toArray();
    expect(all).toHaveLength(1); // not duplicated
    expect(all[0].role).toBe("admin");
  });

  it("is idempotent — re-running on an existing admin changes nothing", async () => {
    runScript(["--email=boss@example.com", "--password=StrongPass1!"]);
    const before = await db.collection("users").findOne({ email: "boss@example.com" });

    const out = runScript(["--email=boss@example.com", "--promote"]);
    expect(out).toMatch(/already an admin/i);

    const after = await db.collection("users").findOne({ email: "boss@example.com" });
    expect(after.password).toBe(before.password); // password untouched
  });

  it("refuses --promote for an account that doesn't exist", async () => {
    const out = runScript(["--email=nobody@example.com", "--promote"], true);
    expect(out).toMatch(/No account found/i);
    const count = await db.collection("users").countDocuments();
    expect(count).toBe(0);
  });

  it("rejects a too-short password", async () => {
    const out = runScript(["--email=weak@example.com", "--password=short"], true);
    expect(out).toMatch(/at least 8 characters/i);
    const count = await db.collection("users").countDocuments();
    expect(count).toBe(0);
  });

  it("requires an email", async () => {
    const out = runScript(["--password=StrongPass1!"], true);
    expect(out).toMatch(/Missing --email/i);
  });
});
