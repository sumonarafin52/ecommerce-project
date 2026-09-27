import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod;

export async function startTestDB() {
  // USE_REPLSET=1 runs against a replica set, which supports real
  // transactions — the same topology as MongoDB Atlas in production. The
  // default standalone server can't, so it only exercises the fallback.
  mongod = process.env.USE_REPLSET
    ? await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    : await MongoMemoryServer.create();
  const uri = mongod.getUri();
  // API routes call connectDB(), which reads process.env.MONGODB_URI
  // directly — it doesn't inherit the connection we open below, so this
  // has to be set or every route under test throws on connect.
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  return uri;
}

export async function stopTestDB() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
