// lib/useCartSync.js
"use client";

// Checks the cart against the shop when a page that shows prices opens.
//
// Both the cart and the checkout need this, and they need to agree: it would
// be worse than useless for the cart to show a corrected total and checkout
// to show the old one. So the call, the correction and the wording all live
// here and both pages render the same result.
import { useCallback, useEffect, useRef, useState } from "react";
import useCartStore, { cartKeyOf } from "@/store/cartStore";
import { describeIssue } from "@/lib/cartIssues";
import { formatCurrency } from "@/lib/utils";

/**
 * Returns { checking, notices, dismiss, recheck }.
 *
 * `notices` is one entry per line that changed, already worded for a
 * shopper. It stays on screen until dismissed, because the whole point is
 * that the shopper sees it — a toast that fades is not good enough when the
 * amount they are about to pay has moved.
 */
export function useCartSync({ enabled = true } = {}) {
  const items = useCartStore((s) => s.items);
  const applyRevalidation = useCartStore((s) => s.applyRevalidation);

  const [checking, setChecking] = useState(false);
  const [notices, setNotices] = useState([]);

  // The check runs once per page open, not on every cart edit: re-running it
  // while the shopper is pressing − and + would fight them for the quantity.
  const hasRun = useRef(false);
  // Read through a ref so `items` isn't a dependency — including it would
  // restart the check each time the correction lands and changes the cart.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const run = useCallback(async () => {
    const current = itemsRef.current;
    if (!current.length) {
      setNotices([]);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: current.map((i) => ({
            product: i._id,
            quantity: i.quantity,
            combinationKey: i.combinationKey || "",
            // what they were last shown, so the server can say what it was
            // before — never used in any calculation
            price: i.discountPrice > 0 ? i.discountPrice : i.price,
          })),
        }),
      }).then((r) => r.json());

      if (!res?.success) return;

      const changed = (res.data.items || []).filter((l) => l.issues?.length);
      setNotices(
        changed.map((l) => ({
          key: `${l.product}${l.combinationKey ? `:${l.combinationKey}` : ""}`,
          name: l.name,
          messages: l.issues.map((issue) => describeIssue(issue, formatCurrency)),
        }))
      );
      applyRevalidation(res.data.items);
    } catch {
      // The shop being unreachable must not empty anyone's cart or block
      // the page. The order route checks everything again at the moment of
      // purchase, so a missed check here costs a surprise, never an
      // incorrect charge.
    } finally {
      setChecking(false);
    }
  }, [applyRevalidation]);

  useEffect(() => {
    if (!enabled || hasRun.current) return;
    // The cart is persisted in localStorage, so on the first render it is
    // still empty — zustand rehydrates a tick later. Latching the run here
    // would check an empty cart and never look again, which is exactly how
    // this silently did nothing at first. Wait until there is a cart to
    // check; `hasRun` then stops it restarting on every quantity change.
    if (!items.length) return;
    hasRun.current = true;
    run();
  }, [enabled, run, items.length]);

  const dismiss = useCallback(() => setNotices([]), []);
  const recheck = useCallback(() => run(), [run]);

  return { checking, notices, dismiss, recheck };
}

export { cartKeyOf };
