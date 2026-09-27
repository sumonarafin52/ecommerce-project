// app/api/account/forgot-password/route.js
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { validateEmail } from "@/lib/authValidation";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Identical for every outcome — existing account, no account, or email
// delivery failure — so this endpoint can't be used to discover which
// addresses are registered.
const GENERIC_RESPONSE = {
  success: true,
  message: "If an account exists for that email, we've sent a link to reset your password. Check your inbox (and spam folder).",
};

function resetEmail(link) {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E3A5F; margin: 0 0 12px;">Reset your password</h2>
      <p style="color: #2B2318; font-size: 14px; line-height: 1.6;">
        We received a request to reset the password for your account. Click the button below to choose a new one.
      </p>
      <a href="${link}" style="display: inline-block; margin: 16px 0; background: #C98A2B; color: #1E3A5F; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px;">
        Reset password
      </a>
      <p style="color: #8C8168; font-size: 12px; line-height: 1.6;">
        This link expires in 1 hour and can only be used once.<br>
        If you didn't ask for this, you can safely ignore this email — your password won't change.
      </p>
    </div>
  `;
}

export async function POST(request) {
  try {
    const { email } = (await request.json()) || {};

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ success: false, message: emailError }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Per-IP stops one host spraying requests; per-email stops anyone
    // (from any IP) flooding a single person's inbox with reset mails.
    const ip = getClientIp(request);
    const ipLimit = await rateLimit(`forgot-ip:${ip}`, { max: 10, windowMs: 60 * 60_000 });
    const emailLimit = await rateLimit(`forgot-email:${normalizedEmail}`, { max: 3, windowMs: 60 * 60_000 });
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many reset requests. Please wait a while before trying again." },
        { status: 429 }
      );
    }

    await connectDB();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // 256 bits of randomness — not guessable. Only its hash is stored;
      // the raw token lives nowhere except the emailed link.
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      // Issuing a new token replaces any earlier one, so only the most
      // recent link ever works.
      await User.updateOne(
        { _id: user._id },
        { $set: { resetTokenHash: tokenHash, resetTokenExpires: new Date(Date.now() + TOKEN_TTL_MS) } }
      );

      const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
      const link = `${origin}/reset-password?token=${rawToken}`;

      // Not awaited on purpose. Waiting for SMTP (often a second or more)
      // made the "account exists" path measurably slower than the "no
      // account" path — a timing side channel that would reveal which
      // emails are registered despite the identical response body.
      sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: resetEmail(link),
      })
        .then((result) => {
          if (result.sent) return;
          // The customer still gets the generic response (anything else
          // would leak whether the account exists), so make sure the store
          // owner can see this in the server logs.
          console.error(
            `[forgot-password] reset email NOT delivered to an existing account — ${result.reason}. ` +
              "Configure SMTP in Admin → Settings → Email Notifications."
          );
          // In local development only, print the link so the flow is
          // testable without an SMTP server. Never in production — it's a
          // live credential.
          if (process.env.NODE_ENV !== "production") {
            console.log(`[forgot-password] DEV ONLY reset link: ${link}`);
          }
        })
        .catch((err) => console.error("[forgot-password] email send threw:", err.message));
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("[forgot-password]", error);
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
