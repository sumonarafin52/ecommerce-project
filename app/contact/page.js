// app/contact/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const TOPICS = [
  ["order", "Order or delivery"],
  ["payment", "Payment or refund"],
  ["product", "Product question"],
  ["account", "My account"],
  ["other", "Something else"],
];

const inputCls =
  "w-full bg-cream-white border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder-ink-muted outline-none focus:border-indigo-900 transition-colors";
const labelCls = "block text-[12px] font-bold text-ink-soft mb-1.5";

export default function ContactPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState({ name: "", email: "", phone: "", category: "", subject: "", orderNumber: "", message: "", website: "" });
  const [store, setStore] = useState({ storeEmail: "", storePhone: "", storeAddress: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");

  useEffect(() => {
    if (session?.user) {
      setForm((f) => ({ ...f, name: f.name || session.user.name || "", email: f.email || session.user.email || "" }));
    }
  }, [session]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        const g = res.success ? res.data.general || {} : {};
        setStore({ storeEmail: g.storeEmail || "", storePhone: g.storePhone || "", storeAddress: g.storeAddress || "" });
      })
      .catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.category) return setError("Please choose a topic");
    setBusy(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setTicket(res.data.ticketNumber);
    } catch (err) {
      setError(err.message || "Couldn't send your message");
    }
    setBusy(false);
  };

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <nav className="text-[13px] text-ink-muted flex items-center gap-2 mb-5">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span>›</span>
          <span className="text-ink">Contact us</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-7">
          <div className="bg-cream-white border border-line rounded-xl p-6 sm:p-8">
            <h1 className="font-display text-2xl font-semibold text-ink">How can we help?</h1>
            <p className="text-sm text-ink-muted mt-1.5 mb-6">Send us a message and we&apos;ll reply by email, usually within a day.</p>

            {ticket ? (
              <div className="text-center py-10 animate-fade-up">
                <span className="text-4xl">📨</span>
                <h2 className="font-display text-xl font-semibold text-ink mt-3">Message sent</h2>
                <p className="text-sm text-ink-muted mt-2">
                  Your reference is <span className="font-bold text-indigo-900">{ticket}</span>. We&apos;ve emailed you a copy.
                </p>
                <Link href="/" className="inline-block mt-6 text-sm font-bold text-indigo-900 hover:underline">
                  Back to shopping
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <p className="text-sm font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3">{error}</p>
                )}

                <div>
                  <p className={labelCls}>What&apos;s it about?</p>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: value }))}
                        className={`text-[13px] font-semibold rounded-full px-3.5 py-1.5 border-[1.5px] transition-colors ${
                          form.category === value
                            ? "border-indigo-900 bg-indigo-900 text-white"
                            : "border-line text-ink-soft hover:border-indigo-700/50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Your name</label>
                    <input className={inputCls} required maxLength={80} value={form.name} onChange={set("name")} />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" className={inputCls} required maxLength={254} value={form.email} onChange={set("email")} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Phone <span className="font-normal text-ink-muted">(optional)</span></label>
                    <input className={inputCls} maxLength={30} value={form.phone} onChange={set("phone")} placeholder="01XXXXXXXXX" />
                  </div>
                  {["order", "payment"].includes(form.category) && (
                    <div>
                      <label className={labelCls}>Order number <span className="font-normal text-ink-muted">(if you have one)</span></label>
                      <input className={inputCls} maxLength={40} value={form.orderNumber} onChange={set("orderNumber")} placeholder="ORD-..." />
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Subject</label>
                  <input className={inputCls} required minLength={3} maxLength={150} value={form.subject} onChange={set("subject")} />
                </div>

                <div>
                  <label className={labelCls}>Message</label>
                  <textarea className={inputCls} required minLength={10} maxLength={5000} rows={6} value={form.message} onChange={set("message")} />
                  <p className="text-[11px] text-ink-muted mt-1 text-right">{form.message.length}/5000</p>
                </div>

                {/* honeypot — invisible to people, filled in by bots */}
                <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full sm:w-auto bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-8 py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {busy ? "Sending..." : "Send message"}
                </button>
              </form>
            )}
          </div>

          <aside className="space-y-4">
            <div className="bg-cream-white border border-line rounded-xl p-5">
              <h3 className="text-sm font-bold text-ink mb-3">Quick help</h3>
              <Link href="/track" className="flex items-center gap-2 text-sm text-ink-soft hover:text-indigo-900 py-1.5">📦 Track an order</Link>
              <Link href="/profile" className="flex items-center gap-2 text-sm text-ink-soft hover:text-indigo-900 py-1.5">↩️ Request a return</Link>
              <Link href="/forgot-password" className="flex items-center gap-2 text-sm text-ink-soft hover:text-indigo-900 py-1.5">🔑 Reset your password</Link>
            </div>
            {(store.storeEmail || store.storePhone || store.storeAddress) && (
              <div className="bg-cream-white border border-line rounded-xl p-5 text-sm space-y-2">
                <h3 className="font-bold text-ink mb-1">Reach us directly</h3>
                {store.storeEmail && (
                  <a href={`mailto:${store.storeEmail}`} className="block text-ink-soft hover:text-indigo-900">✉️ {store.storeEmail}</a>
                )}
                {store.storePhone && (
                  <a href={`tel:${store.storePhone.replace(/[^\d+]/g, "")}`} className="block text-ink-soft hover:text-indigo-900">
                    📞 {store.storePhone}
                  </a>
                )}
                {store.storeAddress && <p className="text-ink-muted">📍 {store.storeAddress}</p>}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
