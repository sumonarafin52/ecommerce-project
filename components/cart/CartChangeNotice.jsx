// components/cart/CartChangeNotice.jsx
"use client";

// Tells the shopper what changed in their cart while it was sitting there.
//
// Deliberately a panel and not a toast: the amount they are about to pay has
// moved, and that is not something to show for four seconds and take away.
// It stays until they dismiss it.
export default function CartChangeNotice({ notices, onDismiss }) {
  if (!notices?.length) return null;

  return (
    <div
      // assertive, not polite: a screen-reader user should not place an
      // order before hearing that the price changed
      role="alert"
      aria-live="assertive"
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.516 2.63H3.72c-1.347 0-2.189-1.463-1.515-2.63L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-amber-900">
            {notices.length === 1 ? "One item changed" : `${notices.length} items changed`} while your cart was
            waiting
          </p>
          <ul className="mt-1.5 space-y-1">
            {notices.map((n) => (
              <li key={n.key} className="text-[12.5px] text-amber-900/90">
                <span className="font-semibold">{n.name}</span>
                {n.messages.map((m, i) => (
                  <span key={i}> — {m}</span>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12px] text-amber-900/70">Your total has been updated to match.</p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-amber-700 hover:text-amber-900 text-sm font-bold px-2 py-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
