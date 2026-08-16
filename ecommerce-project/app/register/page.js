// app/register/page.js
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import AuthShell from "@/components/auth/AuthShell";

const inputCls =
  "w-full px-3.5 py-3 border-[1.5px] border-line rounded-lg text-sm text-ink outline-none focus:border-indigo-900 transition-colors";

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
    <AuthShell
      quote="Sell more than you shop? Sellers welcome too."
      sub="One account gets you buying and, whenever you're ready, everything you need to shop smarter on SumonMart."
      stats={[
        { value: "18k+", label: "active sellers" },
        { value: "0%", label: "signup fee" },
      ]}
    >
      <h1 className="font-display text-[27px] font-semibold text-ink mb-1.5">Create your account</h1>
      <p className="text-sm text-ink-muted mb-7">Takes less than a minute — no credit card required.</p>

      {error && (
        <p className="text-sm font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-bold text-ink-soft mb-1.5">Full name</label>
          <input type="text" required className={inputCls} placeholder="Your full name" value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className="block text-[13px] font-bold text-ink-soft mb-1.5">Email address</label>
          <input type="email" required className={inputCls} placeholder="you@example.com" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className="block text-[13px] font-bold text-ink-soft mb-1.5">Password</label>
          <input type="password" required className={inputCls} placeholder="At least 6 characters" value={form.password} onChange={set("password")} />
        </div>
        <div>
          <label className="block text-[13px] font-bold text-ink-soft mb-1.5">Confirm password</label>
          <input type="password" required className={inputCls} placeholder="Re-enter password" value={form.confirm} onChange={set("confirm")} />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-3.5 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="text-center text-[13.5px] text-ink-soft mt-6">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-indigo-900 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
