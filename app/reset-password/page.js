// app/reset-password/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import PasswordField from "@/components/auth/PasswordField";
import { validatePassword } from "@/lib/authValidation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState(null); // null = not read yet, "" = missing
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // window.location rather than useSearchParams: matches the pattern used
    // elsewhere in this project and avoids Next's Suspense-boundary
    // requirement for useSearchParams in client pages.
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const clientError = validatePassword(password);
    if (clientError) return setError(clientError);
    if (password !== confirm) return setError("Passwords don't match");

    setLoading(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <AuthShell
      quote="Almost there."
      sub="Choose a strong new password — one you don't use on any other site."
      stats={[
        { value: "8+", label: "characters" },
        { value: "🔒", label: "encrypted storage" },
      ]}
    >
      <h1 className="font-display text-[27px] font-semibold text-ink mb-1.5">Choose a new password</h1>
      <p className="text-sm text-ink-muted mb-7">This will replace your old password straight away.</p>

      {token === "" ? (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3">
            This reset link is missing its code. Please use the full link from your email, or request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="block text-center bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-lg text-sm transition-colors"
          >
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3.5">
          <p className="font-bold mb-1">✓ Password updated</p>
          Taking you to sign in…
        </div>
      ) : (
        <>
          {error && (
            <div className="text-sm font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3 mb-4">
              {error}
              {/expired|invalid/i.test(error) && (
                <Link href="/forgot-password" className="block mt-1.5 underline">
                  Request a new link
                </Link>
              )}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} label="New password" showMeter />
            <div>
              <PasswordField
                label="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
              />
              {confirm && password !== confirm && (
                <p className="text-[12px] font-bold text-brick mt-1.5">Passwords don&apos;t match</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || token === null}
              className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Updating..." : "Reset password"}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
