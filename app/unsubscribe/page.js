// app/unsubscribe/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function UnsubscribePage() {
  const [token, setToken] = useState(null);
  const [state, setState] = useState("idle"); // idle | working | done | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  // Deliberately a button, not automatic on page load: email security
  // scanners open every link in a message, and an auto-unsubscribe would
  // silently remove people who never asked to leave.
  const confirm = async () => {
    setState("working");
    try {
      const res = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => r.json());
      setMessage(res.message);
      setState(res.success ? "done" : "error");
    } catch {
      setMessage("Something went wrong. Please try again.");
      setState("error");
    }
  };

  return (
    <div className="bg-cream-bg min-h-[60vh] flex items-center justify-center px-4 font-body2">
      <div className="bg-cream-white border border-line rounded-xl p-8 max-w-md w-full text-center">
        {state === "done" ? (
          <>
            <span className="text-4xl">👋</span>
            <h1 className="font-display text-2xl font-semibold text-ink mt-3">You&apos;re unsubscribed</h1>
            <p className="text-sm text-ink-muted mt-2">You won&apos;t get marketing emails from us anymore. Order updates will still arrive.</p>
            <Link href="/" className="inline-block mt-6 text-sm font-bold text-indigo-900 hover:underline">Back to the store</Link>
          </>
        ) : token === "" ? (
          <>
            <h1 className="font-display text-xl font-semibold text-ink">Link incomplete</h1>
            <p className="text-sm text-ink-muted mt-2">Please use the full unsubscribe link from the email.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-ink">Unsubscribe from our newsletter?</h1>
            <p className="text-sm text-ink-muted mt-2">You&apos;ll stop getting deals and announcements. Order updates aren&apos;t affected.</p>
            {state === "error" && <p className="text-sm font-semibold text-brick mt-4">{message}</p>}
            <button
              onClick={confirm}
              disabled={state === "working" || token === null}
              className="mt-6 bg-indigo-900 hover:bg-indigo-950 text-white font-bold px-6 py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {state === "working" ? "Working..." : "Yes, unsubscribe me"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
