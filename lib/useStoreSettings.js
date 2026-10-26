// lib/useStoreSettings.js
"use client";

import { useEffect, useState } from "react";
import { createSingleFlight, jsonFetcher } from "@/lib/singleFlight";

// One in-flight/settled request shared by every component on the page.
// Previously the header and footer each requested /api/settings on every
// page load (and a third consumer would have made it three).
//
// Display-only consumers use this. Checkout intentionally does NOT: payment
// methods must reflect the admin's latest change, so it fetches fresh.
const source = createSingleFlight(jsonFetcher("/api/settings"));

export function fetchStoreSettings() {
  return source.get();
}

export default function useStoreSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchStoreSettings().then((d) => alive && setSettings(d));
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
