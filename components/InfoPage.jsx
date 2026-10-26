// components/InfoPage.jsx — server component
import Link from "next/link";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import { INFO_PAGES } from "@/lib/pageTemplates";
import { renderSimpleMarkdown, fillPlaceholders } from "@/lib/simpleMarkdown";
import { RETURN_WINDOW_DAYS } from "@/lib/policyConstants";

export async function loadInfoPage(key) {
  const page = INFO_PAGES[key];
  let settings = null;
  try {
    await connectDB();
    settings = await Settings.findOne().select("general pages pagesUpdatedAt").lean();
  } catch {
    // still render the template if the DB is briefly unavailable
  }
  const g = settings?.general || {};
  const custom = settings?.pages?.[key];
  const source = custom && custom.trim() ? custom : page.template;
  const filled = fillPlaceholders(source, {
    storeName: g.storeName || "our store",
    storeEmail: g.storeEmail,
    storePhone: g.storePhone,
    storeAddress: g.storeAddress,
    returnDays: RETURN_WINDOW_DAYS,
  });
  // a date only for owner-written text — the built-in template has no meaningful one
  const updatedAt = custom && custom.trim() ? settings?.pagesUpdatedAt?.[key] : null;
  return { page, html: renderSimpleMarkdown(filled), storeName: g.storeName || "", updatedAt };
}

export default async function InfoPage({ pageKey }) {
  const { page, html, updatedAt } = await loadInfoPage(pageKey);

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6 sm:py-10">
        <nav className="text-[13px] text-ink-muted flex items-center gap-2 mb-5" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink">{page.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 lg:gap-10 items-start">
          {/* other pages — a swipeable row on phones, a sidebar on desktop */}
          <aside className="lg:sticky lg:top-6 -mx-4 px-4 lg:mx-0 lg:px-0 overflow-x-auto no-scrollbar">
            <ul className="flex lg:flex-col gap-2 lg:gap-1">
              {Object.entries(INFO_PAGES).map(([k, p]) => (
                <li key={k} className="shrink-0">
                  <Link
                    href={p.path}
                    aria-current={k === pageKey ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-full lg:rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      k === pageKey
                        ? "bg-indigo-900 text-white"
                        : "bg-cream-white lg:bg-transparent border border-line lg:border-0 text-ink-soft hover:text-indigo-900 hover:bg-cream-white"
                    }`}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          <article className="bg-cream-white border border-line rounded-2xl p-6 sm:p-10 max-w-3xl">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">{page.title}</h1>
            {updatedAt && pageKey !== "about" && (
              <p className="text-xs text-ink-muted mt-2">
                Last updated {new Date(updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            {/* content is escaped and link-checked by renderSimpleMarkdown */}
            <div className="info-prose mt-6" dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        </div>
      </div>
    </div>
  );
}
