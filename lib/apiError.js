// lib/apiError.js
import { NextResponse } from "next/server";

/**
 * Standard response for an unexpected server-side failure.
 *
 * The real error is logged (server logs are where it's useful). The client
 * only ever gets a generic message: returning `error.message` directly
 * leaked internals to anyone — e.g. a public endpoint answering
 * "connect ECONNREFUSED 127.0.0.1:27999" exposed the database host and
 * port, and driver/validation errors can reveal schema and query details.
 */
export function serverError(error, context = "api") {
  console.error(`[${context}]`, error);
  return NextResponse.json(
    { success: false, message: "Something went wrong on our side. Please try again." },
    { status: 500 }
  );
}
