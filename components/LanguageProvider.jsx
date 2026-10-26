// components/LanguageProvider.jsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { translate } from "@/lib/i18n";

const LanguageContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k, ready: false });

export const LANG_KEY = "sm_lang";

export default function LanguageProvider({ children }) {
  // Always start at "en" so the server-rendered HTML and the first client
  // render match. The saved choice is applied just after mount — reading
  // localStorage during render would cause a hydration mismatch.
  const router = useRouter();
  const [lang, setLangState] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The cookie wins: it's what the server just rendered this page with, so
    // trusting it keeps client text and server text in the same language.
    // localStorage is the fallback (e.g. a choice made before the cookie
    // existed), and whichever we land on is written back to both.
    const fromCookie = document.cookie.match(/(?:^|;\s*)sm_lang=(bn|en)\b/)?.[1];
    const fromStorage = localStorage.getItem(LANG_KEY);
    const saved = fromCookie || (fromStorage === "bn" || fromStorage === "en" ? fromStorage : null);
    if (saved) {
      setLangState(saved);
      if (fromStorage !== saved) {
        try {
          localStorage.setItem(LANG_KEY, saved);
        } catch {}
      }
      if (fromCookie !== saved) {
        document.cookie = `${LANG_KEY}=${saved}; path=/; max-age=31536000; samesite=lax`;
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    // keep the document language correct for screen readers and search engines
    if (ready) document.documentElement.lang = lang;
  }, [lang, ready]);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // private mode / storage disabled — the choice just won't persist
    }
    // Also a cookie, so server-rendered pages (headings, breadcrumbs) can
    // read the choice — they never see localStorage. Lax + no JS-only flag
    // because it carries no sensitive data.
    document.cookie = `${LANG_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    // server components re-render with the new language
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ lang, setLang, ready, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang, ready]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// convenience: const t = useT()
export function useT() {
  return useContext(LanguageContext).t;
}
