// lib/usePermissions.js
"use client";

import { useCallback, useEffect, useState } from "react";
import { createSingleFlight, jsonFetcher } from "@/lib/singleFlight";

// One in-flight/settled /api/roles request shared by every component on the
// page — the same pattern lib/useStoreSettings.js uses for /api/settings.
//
// Each caller of this hook used to fetch independently. The admin layout
// calls it, every admin page calls it, and several gated components call it,
// so a single admin page load made four identical requests for a permission
// list that cannot change between them. Measured on an admin page: four
// calls, the slowest 221ms.
//
// The cache is cleared by refresh(), which is what the roles screen calls
// after an admin edits a role — so a permission change still takes effect
// without a reload.
const source = createSingleFlight(jsonFetcher("/api/roles"));

export function fetchPermissions(opts) {
  return source.get(opts);
}

/** Drops the cached permissions, e.g. after signing out or changing a role. */
export function clearPermissionsCache() {
  source.clear();
}

export default function usePermissions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((force) => {
    setLoading(true);
    let alive = true;
    fetchPermissions({ force })
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const cancel = load(false);
    return cancel;
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  // "We asked and you may not" and "we could not find out" are different
  // answers, and the admin used to give the first for both: a 500 on
  // /api/roles made `can()` return false for everything, so every page told
  // a signed-in owner "Access denied — your role does not allow this".
  // jsonFetcher resolves to null on a failed or unsuccessful response, so a
  // finished load with no data is the one we could not answer.
  const failed = !loading && data === null;

  const permissions = data?.myPermissions || [];
  // Memoised on the permission list itself, so `can` keeps its identity
  // between renders and doesn't retrigger effects that depend on it.
  const can = useCallback((perm) => permissions.includes(perm), [permissions.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    permissions,
    roles: data?.roles || null,
    catalog: data?.catalog || [],
    loading,
    failed,
    can,
    refresh,
  };
}
