// tests/dbRecovery.test.js
import { describe, it, expect, afterAll } from "vitest";
import net from "net";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;

// a free port nothing is listening on yet
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("connectDB recovers from an outage", () => {
  it("fails while the DB is down, then works once it's back — no restart needed", async () => {
    const port = await freePort();
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/recovery`;
    global.mongoose = { conn: null, promise: null };
    mongoose.set("bufferCommands", false);

    const { default: connectDB } = await import("@/lib/db");

    // 1. database down: the call must fail (not hang forever)
    await expect(
      Promise.race([
        connectDB(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("hung")), 45000)),
      ])
    ).rejects.toThrow();

    // 2. database comes up on the same address
    mongod = await MongoMemoryServer.create({ instance: { port } });

    // 3. the very next call must succeed. Before the fix, the rejected
    //    promise stayed cached and this failed forever.
    const conn = await connectDB();
    expect(conn.connection.readyState).toBe(1);
  }, 90000);
});
