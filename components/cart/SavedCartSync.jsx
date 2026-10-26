// components/cart/SavedCartSync.jsx
"use client";

// Keeps a signed-in shopper's basket on the server, so it is still there on
// the next device — and so an abandoned basket is something the shop can
// actually see.
//
// Renders nothing. It lives next to the session provider rather than on the
// cart page, because the moment that matters most is signing in: that is
// when the basket from the phone has to meet the basket in this browser.
//
// Three rules keep it from fighting the shopper:
//   - the merge runs once per sign-in, not on every render
//   - saves are debounced, so holding down "+" is one write, not eight
//   - a signed-out visitor is left entirely alone (no row, no requests)
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import useCartStore from "@/store/cartStore";

const SAVE_DEBOUNCE_MS = 1200;

export default function SavedCartSync() {
  const { status, data: session } = useSession();
  const items = useCartStore((s) => s.items);
  const mergeServerCart = useCartStore((s) => s.mergeServerCart);

  // Which account we have already merged for. Keyed by user id so switching
  // accounts in the same browser merges again rather than silently keeping
  // the previous person's basket on screen.
  const mergedFor = useRef(null);
  const saveTimer = useRef(null);
  const lastSaved = useRef("");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const userId = session?.user?.id || null;

  // ---- sign-in: bring the saved basket in -----------------------------
  useEffect(() => {
    if (status !== "authenticated" || !userId || mergedFor.current === userId) return;
    mergedFor.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cart/saved", { cache: "no-store" }).then((r) => r.json());
        if (cancelled || !res?.success) return;

        mergeServerCart(res.data.lines);

        // Push the merged basket straight back, so the server holds the
        // union rather than whichever half it happened to have. Read from
        // the ref: the merge above has already landed in the store.
        await save(itemsRef.current);
      } catch {
        // The basket in this browser still works. A failed sync costs the
        // shopper nothing today; pretending it worked would cost them a
        // basket tomorrow.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, mergeServerCart]);

  // ---- sign-out: forget, but do not touch this browser's basket -------
  useEffect(() => {
    if (status === "unauthenticated") {
      mergedFor.current = null;
      lastSaved.current = "";
    }
  }, [status]);

  // ---- ongoing: save changes, debounced -------------------------------
  useEffect(() => {
    if (status !== "authenticated" || !userId || mergedFor.current !== userId) return;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(items), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, status, userId]);

  async function save(list) {
    const payload = (list || []).map((i) => ({
      product: i._id,
      combinationKey: i.combinationKey || "",
      quantity: i.quantity,
    }));

    // Nothing changed since the last save — don't spend a write, and more
    // importantly don't move the basket's "last touched" time, which is
    // what decides whether it counts as abandoned.
    const signature = JSON.stringify(payload);
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;

    try {
      await fetch("/api/cart/saved", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
    } catch {
      lastSaved.current = ""; // let the next change try again
    }
  }

  return null;
}
