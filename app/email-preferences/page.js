// app/email-preferences/page.js
//
// Where the "turn them off" link in a basket reminder lands.
//
// The switch is a button, not something that happens on page load: email
// security scanners open every link in a message before the recipient sees
// it, and an automatic opt-out would quietly unsubscribe people who never
// clicked anything. Same reasoning as the newsletter unsubscribe page, and
// the two are deliberately worded alike.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/Icon";

export default function EmailPreferencesPage() {
  const [token, setToken] = useState(null);
  const [state, setState] = useState("idle"); // idle | working | done | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  const turnOff = async () => {
    setState("working");
    try {
      const res = await fetch("/api/account/email-prefs", {
        method: "PUT",
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
            <Icon name="mail" size={30} className="text-indigo-900 mx-auto mb-3" />
            <h1 className="font-display text-xl font-semibold text-ink">That&apos;s done</h1>
            <p className="text-[13.5px] text-ink-muted mt-2">{message}</p>
          </>
        ) : (
          <>
            <Icon name="mail" size={30} className="text-indigo-900 mx-auto mb-3" />
            <h1 className="font-display text-xl font-semibold text-ink">Turn off basket reminders?</h1>
            <p className="text-[13.5px] text-ink-muted mt-2">
              You&apos;ll stop getting emails about items left in your basket. Everything about your orders — confirmations,
              payment, delivery — carries on as normal.
            </p>
            {state === "error" && <p className="text-[13px] text-red-700 mt-3">{message}</p>}
            <button
              onClick={turnOff}
              disabled={state === "working" || !token}
              className="mt-5 w-full bg-indigo-900 hover:bg-indigo-800 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-lg transition-colors"
            >
              {state === "working" ? "Saving…" : "Turn off basket reminders"}
            </button>
            {!token && (
              <p className="text-[12px] text-ink-muted mt-3">
                This page needs the link from your email. You can also change it in your profile settings.
              </p>
            )}
          </>
        )}

        <Link href="/" className="inline-block mt-5 text-[13px] font-bold text-indigo-900 hover:underline">
          Back to the shop
        </Link>
      </div>
    </div>
  );
}
