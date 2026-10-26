// lib/serverLang.js — for SERVER components only
//
// The language context lives in the browser, so server-rendered text
// (page headings, breadcrumbs, sort labels) couldn't see the customer's
// choice. The provider also writes it to a cookie, which the server can
// read — that's what this does.
//
// Any page using this must be dynamic (all the ones that do already set
// `export const dynamic = "force-dynamic"`), otherwise a cached English
// copy would be served to someone who chose Bangla.
import { cookies } from "next/headers";
import { translate } from "@/lib/i18n";

export const LANG_COOKIE = "sm_lang";

export function getLang() {
  try {
    const value = cookies().get(LANG_COOKIE)?.value;
    return value === "bn" ? "bn" : "en";
  } catch {
    // called outside a request scope — fall back to English
    return "en";
  }
}

/** Server-side translator: const t = getT(); t("allProducts") */
export function getT() {
  const lang = getLang();
  return (key, vars) => translate(lang, key, vars);
}
