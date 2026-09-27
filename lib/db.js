import mongoose from "mongoose";

// Next.js dev mode-এ hot-reload এর কারণে বারবার connect হওয়া আটকাতে
// global cache ব্যবহার করা হয়েছে - এই pattern টা পরিবর্তন করার দরকার নেই।
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // Read at call time, not module load time. A module-level const would
  // freeze whatever value existed at first import, which breaks any setup
  // that populates env after the module graph loads (the test harness does
  // exactly this).
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in .env file");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => mongoose);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Forget the failed attempt. Previously the rejected promise stayed
    // cached, so every later request re-awaited the same failure — one
    // failed connect (a network blip, an Atlas maintenance window) took
    // the site down permanently until someone restarted the server, even
    // after the database was back. Clearing it lets the next request retry.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

export default connectDB;
