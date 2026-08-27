import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod;

export async function startTestDB() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
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
