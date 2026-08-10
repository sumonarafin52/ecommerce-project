// app/login/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputCls =
  "w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

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
    <div className="bg-primary min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-primary-light border border-white/10 rounded-xl p-8 shadow-card">
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-extrabold">
            sumon<span className="text-accent">mart</span>
          </Link>
          <h1 className="text-xl font-bold text-white mt-4">Welcome back</h1>
          <p className="text-sm text-zinc-400 mt-1">Sign in to your account</p>
        </div>

        {error && (
          <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            className={inputCls}
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className={inputCls}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-400 mt-5">
          New to Sumon Mart?{" "}
          <Link href="/register" className="text-accent hover:underline font-bold">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}