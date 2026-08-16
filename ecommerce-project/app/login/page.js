// app/login/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import AuthShell from "@/components/auth/AuthShell";

const inputCls =
  "w-full px-3.5 py-3 border-[1.5px] border-line rounded-lg text-sm text-ink outline-none focus:border-indigo-900 transition-colors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { redirect: false, email, password });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <AuthShell
      quote={`"Ordered in the evening, at my door by morning."`}
      sub="Join shoppers using SumonMart for fast, secure delivery across Bangladesh, backed by verified local sellers."
      stats={[
        { value: "4.7★", label: "App rating" },
        { value: "64", label: "districts covered" },
      ]}
    >
      <h1 className="font-display text-[27px] font-semibold text-ink mb-1.5">Welcome back</h1>
      <p className="text-sm text-ink-muted mb-7">Sign in to track orders, save favorites and check out faster.</p>

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
            className={inputCls}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[13px] font-bold text-ink-soft mb-1.5">Password</label>
          <input
            type="password"
            required
            className={inputCls}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="text-center text-[13.5px] text-ink-soft mt-6">
        New to SumonMart?{" "}
        <Link href="/register" className="font-bold text-indigo-900 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
