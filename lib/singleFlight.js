// lib/singleFlight.js
//
// One in-flight/settled request shared by every component that asks for it.
//
// Several things on a page need the same piece of data — the admin layout
// and the top header both want the order counts, the layout and the
// dashboard both want store readiness, half the admin wants the permission
// list. Each component fetching for itself turned one answer into four
// identical requests per page load.
//
// This is the third place that pattern was needed, so it lives here once
// rather than being written out again per consumer.
"use client";

import { useEffect, useState } from "react";

/**
 * Wraps a fetcher so concurrent and subsequent callers share one result.
 *
 * A failed fetch is NOT cached — the next caller gets to try again, rather
 * than the page being stuck with an error for its lifetime.
 */
export function createSingleFlight(fetcher) {
  let shared = null;

  function get({ force = false } = {}) {
    if (force) shared = null;
    if (!shared) {
      shared = Promise.resolve()
        .then(fetcher)
        .catch(() => null)
        .then((data) => {
          if (data === null || data === undefined) shared = null;
          return data;
        });
    }
    return shared;
  }

  return {
    get,
    clear() {
      shared = null;
    },
  };
}

/** Fetches JSON and unwraps the project's { success, data } envelope. */
export function jsonFetcher(url) {
  return () =>
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res?.success ? res.data : null));
}

/**
 * A hook over a single-flight source. Returns { data, loading, refresh }.
 * Guards against setting state after unmount, which is easy to get wrong
 * when several components share one promise.
 */
export function useSingleFlight(source) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    source
      .get()
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [source]);

  const refresh = () => {
    setLoading(true);
    return source
      .get({ force: true })
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  };

  return { data, loading, refresh };
}
