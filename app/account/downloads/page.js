"use client";

// app/account/downloads/page.js
//
// "My Digital Products" — one place listing everything a customer has bought
// that's downloadable, rather than making them hunt through order cards.
//
// Shows exactly what the customer needs to know and nothing invented: file
// name, size, version, purchase date, order number, downloads used and
// remaining, expiry, licence key. Every number comes from their own
// DownloadGrant records.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DigitalDownloads from "@/components/DigitalDownloads";
import { Skeleton } from "@/components/ui/Skeleton";

export default function DownloadsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | available | unavailable

  const load = () => {
    setFailed(false);
    fetch("/api/downloads", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setGrants(Array.isArray(res.data) ? res.data : []);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/account/downloads");
      return;
    }
    if (status === "authenticated") load();
  }, [status, router]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return grants.filter((g) => {
      if (filter === "available" && !g.available) return false;
      if (filter === "unavailable" && g.available) return false;
      if (!q) return true;
      return (
        g.productName?.toLowerCase().includes(q) ||
        g.orderNumber?.toLowerCase().includes(q) ||
        g.files?.some((f) => f.name?.toLowerCase().includes(q))
      );
    });
  }, [grants, query, filter]);

  const counts = useMemo(
    () => ({
      all: grants.length,
      available: grants.filter((g) => g.available).length,
      unavailable: grants.filter((g) => !g.available).length,
    }),
    [grants]
  );

  if (status === "loading" || loading) {
    return (
      <div className="bg-cream-bg min-h-screen font-body2">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-56" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <Link href="/profile" className="hover:underline">
          My account
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-bold text-ink">Downloads</span>
      </nav>

      <header className="mt-3">
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">My digital products</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Everything you&apos;ve bought that you can download, with your licence keys.
        </p>
      </header>

      {failed && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-bold text-rose-900">We couldn&apos;t load your downloads.</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="mt-2 rounded-lg bg-rose-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800"
          >
            Try again
          </button>
        </div>
      )}

      {!failed && grants.length === 0 && (
        <div className="mt-8 rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-4xl" aria-hidden="true">
            ⚡
          </p>
          <p className="mt-3 text-sm font-bold text-ink">No digital products yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            Downloads appear here as soon as payment for a digital item is confirmed.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            Browse products
          </Link>
        </div>
      )}

      {grants.length > 0 && (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter downloads">
              {[
                ["all", `All (${counts.all})`],
                ["available", `Available (${counts.available})`],
                ["unavailable", `Expired or used up (${counts.unavailable})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    filter === value ? "bg-ink text-white" : "bg-surface text-ink-soft hover:bg-line"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="sm:w-64">
              <span className="sr-only">Search your downloads</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by product, file or order"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-soft">
              Nothing matches that. Try a different search or filter.
            </p>
          ) : (
            <div className="mt-5">
              <DigitalDownloads grants={visible} onChange={load} />
            </div>
          )}
        </>
      )}

      <p className="mt-8 text-xs text-ink-muted">
        Having trouble with a download?{" "}
          <Link href="/contact" className="font-bold text-ink underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
