#!/usr/bin/env node
// scripts/ui-audit.mjs
//
// Measures the admin panel in a real browser and reports what fails.
//
//   npm run build && npm start          # in one terminal
//   npm i -D playwright                 # once
//   npm run audit:ui                    # in another
//
//   ADMIN_EMAIL=a@you.com ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
//     node scripts/ui-audit.mjs [--only=contrast,focus,targets,controls,mobile]
//
// Why this exists: the things that have actually gone wrong in this admin —
// text at 1.3:1, a 16px hit target, five control heights in one filter row,
// nine shapes of the same button — were all invisible to code review and
// obvious the moment something read computed styles in a browser. It exits
// non-zero when a check fails, so CI can hold the line.
//
// Three measurement traps this already accounts for, each of which produced
// a confidently wrong number the first time:
//   1. ALPHA. A chip filled with rgba(…, 0.15) is not that colour — it is
//      that colour composited over everything behind it. Read as opaque, a
//      perfectly readable chip scores 1.00:1.
//   2. GRADIENTS. getComputedStyle().backgroundColor is transparent on a
//      gradient element, so a naive walk falls through to the parent and
//      scores the text against the wrong surface. Each colour stop is
//      scored and the worst kept. Equally, taking the worst of every
//      ANCESTOR layer is wrong the other way: it scores white button text
//      against the white page behind the button. Composite, then compare.
//   3. TRANSITIONS. `transition-all` animates outline and colour, so a
//      value read immediately after focus or hover is mid-tween. Every
//      read here waits for the transition to settle first.
//
// The `states` check is different in kind from the rest: it breaks the API
// on purpose and asks what each page then tells the user. A page that falls
// through to its empty state is the failure that matters — "No orders yet"
// when the database is down is a confident, specific, wrong answer about
// the owner's business, and it looks exactly like good news.
import process from "node:process";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed. Run:  npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const EMAIL = process.env.ADMIN_EMAIL || "a@test.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "TestPass!2345";
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const wants = (name) => !only.length || only.includes(name);

const PAGES = [
  "/admin", "/admin/orders", "/admin/orders/new", "/admin/products", "/admin/products/stock",
  "/admin/products/restock", "/admin/products/performance", "/admin/customers", "/admin/categories",
  "/admin/discounts", "/admin/digital", "/admin/downloads", "/admin/reports", "/admin/carts",
  "/admin/reviews", "/admin/returns", "/admin/support", "/admin/questions", "/admin/newsletter",
  "/admin/settings/general", "/admin/settings/payment", "/admin/settings/billing",
  "/admin/settings/shipping", "/admin/settings/tax", "/admin/settings/notifications",
  "/admin/settings/email",
];

// Text that is exempt from the contrast rule, with the reason. WCAG 1.4.3
// exempts logotypes; this is the store's own initial in its own brand gold
// on its own brand navy, with the store name beside it in readable text.
const CONTRAST_EXEMPT = [
  { match: /text-\[#C98A2B\].*font-display/, why: "brand logo mark (WCAG 1.4.3 logotype exemption)" },
];

let failures = 0;
const report = (title, rows, fmt) => {
  console.log(`\n===== ${title}: ${rows.length} =====`);
  if (!rows.length) return console.log("  clean");
  failures += rows.length;
  for (const r of rows) console.log(fmt(r));
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

async function signedInPage(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await pg.fill('input[type="email"]', EMAIL);
  await pg.fill('input[type="password"]', PASSWORD);
  await pg.keyboard.press("Enter");
  await pg.waitForTimeout(3500);
  if (!/\/admin|\/profile|\/$/.test(new URL(pg.url()).pathname + "")) {
    console.error(`could not sign in as ${EMAIL} — set ADMIN_EMAIL / ADMIN_PASSWORD`);
    process.exit(2);
  }
  return { ctx, pg };
}

// ---------------------------------------------------------------- contrast
const CONTRAST_PROBE = () => {
  const parse = (c) => { const n = (c.match(/[-\d.]+/g) || []).map(Number); return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n.length > 3 ? n[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const stops = (img) => (img.match(/rgba?\([^)]*\)/g) || []).map(parse).filter((c) => c.a > 0);
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const stackFor = (el, pick) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const st = stops(s.backgroundImage || "");
      if (st.length) layers.push(pick(st));
      const c = parse(s.backgroundColor);
      if (c.a > 0) layers.push(c);
    }
    layers.push({ r: 255, g: 255, b: 255, a: 1 });
    let acc = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  const byLum = (st) => [...st].sort((a, b) => lum(a) - lum(b));
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const t = (el.textContent || "").trim();
    if (!t || el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) < 0.95) continue;
    const fg = parse(s.color);
    if (fg.a < 0.95) continue;
    const px = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
    const dark = stackFor(el, (st) => byLum(st)[0]);
    const light = stackFor(el, (st) => byLum(st)[st.length - 1]);
    let worst = Infinity, bg = null;
    for (const c of [dark, light]) { const v = ratio(fg, c); if (v < worst) { worst = v; bg = c; } }
    if (worst < need) {
      out.push({
        ratio: +worst.toFixed(2), need, px, txt: t.slice(0, 26),
        cls: typeof el.className === "string" ? el.className.slice(0, 70) : "",
        fg: `rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      });
    }
  }
  return out;
};

async function contrast() {
  for (const [label, vp, mob] of [["desktop", { width: 1440, height: 1000 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
    const { ctx, pg } = await signedInPage(vp, mob);
    const found = new Map();
    for (const p of PAGES) {
      await pg.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
      await pg.waitForTimeout(1000);
      for (const r of await pg.evaluate(CONTRAST_PROBE)) {
        if (CONTRAST_EXEMPT.some((e) => e.match.test(r.cls))) continue;
        const k = `${r.cls}|${r.fg}|${r.bg}`;
        if (!found.has(k)) found.set(k, { ...r, pages: new Set() });
        found.get(k).pages.add(p);
      }
    }
    report(`contrast below AA (${label})`, [...found.values()].sort((a, b) => a.ratio - b.ratio),
      (v) => ` ${v.ratio}:1 (needs ${v.need}) ${v.px}px "${v.txt}" ${v.fg} on ${v.bg}\n     ${[...v.pages].slice(0, 3).join(", ")}\n     ${v.cls}`);
    await ctx.close();
  }
}

// ------------------------------------------------------------------- focus
async function focus() {
  const { ctx, pg } = await signedInPage({ width: 1440, height: 1000 });
  const bad = new Map();
  let n = 0;
  for (const p of PAGES) {
    await pg.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
    await pg.waitForTimeout(900);
    const seen = new Set();
    for (let i = 0; i < 45; i++) {
      await pg.keyboard.press("Tab");
      await pg.waitForTimeout(260); // the outline sits inside `transition-all`
      const r = await pg.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const s = getComputedStyle(e);
        const ow = parseFloat(s.outlineWidth) || 0;
        const transparent = /rgba\([^)]*,\s*0\)/.test(s.outlineColor || "");
        const ring = s.boxShadow && s.boxShadow !== "none";
        return {
          visible: (ow >= 1 && !transparent) || ring,
          tag: e.tagName.toLowerCase(),
          txt: (e.textContent || e.getAttribute("aria-label") || e.placeholder || "").trim().slice(0, 26),
          cls: typeof e.className === "string" ? e.className.slice(0, 78) : "",
        };
      });
      if (!r) break;
      const id = r.cls + "|" + r.txt;
      if (seen.has(id)) continue;
      seen.add(id); n++;
      if (!r.visible) {
        const k = r.cls || r.tag;
        if (!bad.has(k)) bad.set(k, { ...r, pages: new Set() });
        bad.get(k).pages.add(p);
      }
    }
  }
  console.log(`\n(tabbed through ${n} distinct controls)`);
  report("controls with no visible keyboard focus", [...bad.values()],
    (v) => ` ${v.tag} "${v.txt}"\n     ${[...v.pages].slice(0, 3).join(", ")}\n     ${v.cls}`);
  await ctx.close();
}

// ----------------------------------------------------------------- targets
async function targets() {
  const { ctx, pg } = await signedInPage({ width: 390, height: 844 }, true);
  const small = new Map();
  for (const p of PAGES) {
    await pg.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
    await pg.waitForTimeout(900);
    for (const r of await pg.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, [role="button"], input[type="checkbox"], input[type="radio"], select')) {
        // WCAG 2.5.8 exempts targets whose size is set by the line-height of
        // surrounding text — an inline link in a sentence or a table cell.
        if (el.tagName === "A") continue;
        // The hit area is not the <input>. A checkbox is commonly a 16px box
        // painted inside a larger clickable wrapper — Checkbox.jsx uses a
        // 24px span with a negative margin, so the span, the input and the
        // <label> all report different sizes and only the span is the truth.
        // Walk from the control up to its label and take the largest width
        // and height on the way: every one of those boxes toggles it.
        let w = 0, h = 0;
        for (let n = el; n; n = n.parentElement) {
          const r = n.getBoundingClientRect();
          w = Math.max(w, r.width); h = Math.max(h, r.height);
          if (n.tagName === "LABEL") break;
          if (n === el.closest("label")) break;
          if (!el.closest("label") && n !== el) break;   // no label: the control itself
        }
        if (w === 0 || h === 0) continue;
        if (w >= 24 && h >= 24) continue;
        out.push({ w: Math.round(w), h: Math.round(h), tag: el.tagName.toLowerCase(),
          txt: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24),
          cls: typeof el.className === "string" ? el.className.slice(0, 60) : "" });
      }
      return out;
    })) {
      const k = r.cls || r.tag;
      if (!small.has(k)) small.set(k, { ...r, pages: new Set() });
      small.get(k).pages.add(p);
    }
  }
  report("touch targets under 24x24 (WCAG 2.5.8)", [...small.values()],
    (v) => ` ${v.w}x${v.h} ${v.tag} "${v.txt}"\n     ${[...v.pages].slice(0, 3).join(", ")}\n     ${v.cls}`);
  await ctx.close();
}

// ---------------------------------------------------------------- controls
// Not a pass/fail — a census. Two text-field shapes and a handful of button
// shapes is a design system; fifteen is drift. Printed so the number is
// visible when someone adds the sixteenth.
async function controls() {
  const { ctx, pg } = await signedInPage({ width: 1440, height: 1000 });
  const fields = new Map(), buttons = new Map();
  for (const p of PAGES) {
    await pg.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
    await pg.waitForTimeout(900);
    for (const t of ["Filter", "Filters"]) await pg.getByRole("button", { name: t, exact: true }).first().click({ timeout: 600 }).catch(() => {});
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => {
      const f = [], b = [];
      for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')) {
        const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 10) continue;
        const s = getComputedStyle(e);
        f.push([s.borderRadius, s.paddingTop + "/" + s.paddingLeft, Math.round(r.height) + "px", s.backgroundColor, s.borderColor, s.fontSize].join(" | "));
      }
      for (const e of document.querySelectorAll("button, a[href]")) {
        if (e.closest("aside, nav, header")) continue;
        const r = e.getBoundingClientRect(); if (r.height < 20 || r.width < 28) continue;
        const s = getComputedStyle(e);
        if (s.backgroundColor === "rgba(0, 0, 0, 0)" && !/gradient/.test(s.backgroundImage)) continue;
        if (parseInt(s.fontWeight, 10) < 600) continue;
        b.push([s.borderRadius, s.paddingTop + "/" + s.paddingLeft, Math.round(r.height) + "px", s.fontSize, s.fontWeight, s.backgroundColor].join(" | "));
      }
      return { f, b };
    });
    for (const k of r.f) fields.set(k, (fields.get(k) || 0) + 1);
    for (const k of r.b) buttons.set(k, (buttons.get(k) || 0) + 1);
  }
  const show = (title, m) => {
    console.log(`\n===== ${title}: ${m.size} distinct =====`);
    for (const [k, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(` ${String(n).padStart(3)}×  ${k}`);
  };
  show("text field shapes", fields);
  show("button shapes", buttons);
  await ctx.close();
}

// ------------------------------------------------------------------ mobile
async function mobile() {
  const { ctx, pg } = await signedInPage({ width: 390, height: 844 }, true);
  const over = [];
  for (const p of PAGES) {
    await pg.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
    await pg.waitForTimeout(900);
    const r = await pg.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      const culprits = [];
      if (sw > vw + 1) {
        for (const el of document.querySelectorAll("*")) {
          const b = el.getBoundingClientRect();
          if (b.right <= vw + 1 || b.width < 20) continue;
          const pr = el.parentElement?.getBoundingClientRect();
          if (pr && pr.right > vw + 1) continue;   // only the outermost offender
          culprits.push(`${el.tagName.toLowerCase()} w=${Math.round(b.width)} "${(el.textContent || "").trim().slice(0, 20)}"`);
        }
      }
      return { vw, sw, culprits: culprits.slice(0, 3) };
    });
    if (r.sw > r.vw + 1) over.push({ p, ...r });
  }
  report("pages that scroll sideways at 390px", over,
    (v) => ` ${v.p}  document ${v.sw}px in a ${v.vw}px window (+${v.sw - v.vw})\n     ${v.culprits.join("\n     ")}`);
  await ctx.close();
}

// ------------------------------------------------------------------ states
// What does each page say when its data fails to load?
async function states() {
  const ERRORY = /(couldn'?t|could not|failed|unable|went wrong|try again|retry|error|problem)/i;
  const EMPTYISH = /(no |nothing|none yet|not yet|empty|0 results|haven'?t)/i;
  const { ctx, pg } = await signedInPage({ width: 1440, height: 1000 });
  // Auth and the permission list stay up: this asks what a page does when
  // ITS OWN data fails, not what it does when it cannot tell who you are.
  await ctx.route("**/api/**", (route) =>
    /\/api\/auth\/|\/api\/roles/.test(route.request().url())
      ? route.continue()
      : route.fulfill({ status: 500, contentType: "application/json", body: '{"success":false}' })
  );
  const bad = [];
  for (const p of PAGES) {
    await pg.goto(BASE + p, { waitUntil: "domcontentloaded" }).catch(() => {});
    await pg.waitForTimeout(2600);
    const r = await pg.evaluate(({ e, m }) => {
      const er = new RegExp(e, "i"), em = new RegExp(m, "i");
      const main = document.querySelector("main") || document.body;
      const c = main.cloneNode(true);
      for (const n of c.querySelectorAll("aside, nav, header, script, style")) n.remove();
      const text = (c.textContent || "").replace(/\s+/g, " ").trim();
      return {
        chars: text.length, snippet: text.slice(0, 110),
        error: er.test(text), empty: em.test(text),
        spinner: !!main.querySelector(".animate-pulse, .animate-spin, [data-loading]"),
        retry: [...main.querySelectorAll("button, a")].some((x) => /retry|try again|reload/i.test(x.textContent || "")),
      };
    }, { e: ERRORY.source, m: EMPTYISH.source });
    if (r.error) continue;                                   // says so: fine
    const why = r.spinner ? "spins forever" : r.empty ? "shows an empty state — it LIES" : "shows nothing";
    bad.push({ p, why, snippet: r.snippet });
  }
  report("pages that do not say their data failed to load", bad,
    (v) => ` ${v.p} — ${v.why}\n     "${v.snippet}"`);
  await ctx.close();
}

if (wants("contrast")) await contrast();
if (wants("focus")) await focus();
if (wants("targets")) await targets();
if (wants("mobile")) await mobile();
if (wants("states")) await states();
if (wants("controls")) await controls();   // census last: it never fails the run

await browser.close();
console.log(failures ? `\n${failures} issue(s) found.` : "\nNo issues found.");
process.exit(failures ? 1 : 0);
