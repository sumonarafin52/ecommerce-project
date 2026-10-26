// app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is not set");
}

// A real bcrypt hash of a throwaway string. Compared against whenever no
// matching user exists, so an unknown email costs the same time as a wrong
// password and can't be distinguished by response timing.
const DUMMY_HASH = "$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const authOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // brute-force protection: limit attempts per IP+email pair, not
        // just per IP, so it can't be used to lock other people's accounts.
        // Thrown outside the try/catch below so the distinct message
        // actually reaches the client instead of collapsing into a
        // generic "invalid credentials" response.
        const ip = getClientIp(req);
        const emailKey = credentials.email.trim().toLowerCase();
        const limit = await rateLimit(`login:${ip}:${emailKey}`, { max: 8, windowMs: 10 * 60_000 });
        if (!limit.allowed) {
          throw new Error("Too many login attempts. Please try again in a few minutes.");
        }
        // Second layer, keyed on IP alone: the per-IP+email limit above
        // stops someone hammering one account, but not someone rotating
        // through many emails from one host to discover which exist.
        const ipLimit = await rateLimit(`login-ip:${ip}`, { max: 40, windowMs: 10 * 60_000 });
        if (!ipLimit.allowed) {
          throw new Error("Too many login attempts from this network. Please try again shortly.");
        }

        try {
          await connectDB();

          const user = await User.findOne({ email: emailKey })
            .select("+password")
            .lean();

          // Always run a bcrypt comparison, even when no such user exists.
          // Returning early for an unknown email made that path ~100ms
          // faster than a wrong-password attempt, so response timing
          // revealed which email addresses have accounts here.
          const hashToCompare = user?.password || DUMMY_HASH;
          const isPasswordValid = await bcrypt.compare(credentials.password, hashToCompare);

          if (!user || !isPasswordValid) {
            return null;
          }

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
          };
        } catch (error) {
          console.error("Authorization error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.email = user.email;
      }
      // fired by the client's `update({ name, email })` call after a
      // profile edit — merges the new values into the token without
      // requiring the person to sign in again
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
      }

      // Evict sessions issued before the password last changed. Without this
      // a stolen session survived a password reset for up to 30 days — so
      // resetting couldn't actually lock an intruder out.
      //
      // Re-checked at most once every 5 minutes per session: checking on
      // every request would add a database read to every page load, and a
      // 5-minute window to evict is an acceptable trade.
      if (token?.id) {
        const now = Date.now();
        const due = !token.pwCheckedAt || now - token.pwCheckedAt > 5 * 60_000;
        if (due) {
          try {
            await connectDB();
            const fresh = await User.findById(token.id).select("passwordChangedAt role").lean();
            if (!fresh) {
              token.invalidated = true; // account deleted
            } else {
              const changedAt = fresh.passwordChangedAt ? new Date(fresh.passwordChangedAt).getTime() : 0;
              // token.iat is in seconds; allow 5s of clock skew so the
              // password-change request's own fresh token isn't killed
              if (changedAt && token.iat && changedAt > token.iat * 1000 + 5000) {
                token.invalidated = true;
              }
              // pick up a role change without needing a new sign-in
              if (fresh.role) token.role = fresh.role;
            }
            token.pwCheckedAt = now;
          } catch {
            // database hiccup: leave the session alone rather than logging
            // everyone out, and re-check on the next request
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      // a session whose password changed after it was issued is no longer valid
      if (token?.invalidated) return null;
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };