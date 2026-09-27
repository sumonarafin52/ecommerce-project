// app/forgot-password/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setSentMessage(res.message);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <AuthShell
      quote="Locked out? It happens to everyone."
      sub="We'll email you a secure link to choose a new password. It only takes a minute."
      stats={[
        { value: "1 hr", label: "link validity" },
        { value: "1×", label: "single-use link" },
      ]}
    >
      <h1 className="font-display text-[27px] font-semibold text-ink mb-1.5">Forgot your password?</h1>
      <p className="text-sm text-ink-muted mb-7">Enter your account email and we&apos;ll send you a reset link.</p>

      {sentMessage ? (
        <div className="space-y-5">
          <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3.5 leading-relaxed">
            <p className="font-bold mb-1">📬 Check your email</p>
            {sentMessage}
          </div>
          <p className="text-[13px] text-ink-muted">
            Didn&apos;t get it within a few minutes?{" "}
            <button onClick={() => setSentMessage("")} className="font-bold text-indigo-900 hover:underline">
              Try again
            </button>
          </p>
        </div>
      ) : (
        <>
          {error && (
            <p className="text-sm font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3 mb-4">
              {error}
            </p>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-bold text-ink-soft mb-1.5">Email address</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full px-3.5 py-3 border-[1.5px] border-line rounded-lg text-sm text-ink outline-none focus:border-indigo-900 transition-colors"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        </>
      )}

      <p className="text-center text-[13.5px] text-ink-soft mt-6">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-indigo-900 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
