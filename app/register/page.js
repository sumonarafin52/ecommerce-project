// app/register/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputCls =
  "w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message);

      // auto sign-in after successful registration
      const login = await signIn("credentials", {
        redirect: false,
        email: form.email,
        password: form.password,
      });
      if (login?.error) throw new Error("Account created — please sign in");

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="bg-primary min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-primary-light border border-white/10 rounded-xl p-8 shadow-card">
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-extrabold">
            sumon<span className="text-accent">mart</span>
          </Link>
          <h1 className="text-xl font-bold text-white mt-4">Create account</h1>
          <p className="text-sm text-zinc-400 mt-1">Join Sumon Mart today</p>
        </div>

        {error && (
          <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <input
            type="text"
            required
            className={inputCls}
            placeholder="Full name"
            value={form.name}
            onChange={set("name")}
          />
          <input
            type="email"
            required
            className={inputCls}
            placeholder="Email address"
            value={form.email}
            onChange={set("email")}
          />
          <input
            type="password"
            required
            className={inputCls}
            placeholder="Password (min 6 characters)"
            value={form.password}
            onChange={set("password")}
          />
          <input
            type="password"
            required
            className={inputCls}
            placeholder="Confirm password"
            value={form.confirm}
            onChange={set("confirm")}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-400 mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline font-bold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}