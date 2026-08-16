import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

// Next.js dev mode-এ hot-reload এর কারণে বারবার connect হওয়া আটকাতে
// global cache ব্যবহার করা হয়েছে - এই pattern টা পরিবর্তন করার দরকার নেই।
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in .env file");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => mongoose);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
