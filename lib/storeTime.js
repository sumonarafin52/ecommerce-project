// lib/storeTime.js
//
// One answer to "what day is it?" for the whole shop.
//
// Reports used to hold three different answers at once:
//   - the daily revenue series was bucketed by MongoDB in UTC
//   - "today" and "this week" were cut from the SERVER's clock, which on a
//     cloud host is also UTC
//   - the chart's own labels were built from the BROWSER's clock
//
// For a shop in Dhaka (UTC+6) that meant every order taken between midnight
// and 6am was reported on the previous day, and the labels on the chart did
// not line up with the bars underneath them. None of it was visible: the
// figures looked plausible, they were just about the wrong day.
//
// Everything that counts per day now goes through here, with the shop's own
// timezone from Settings → General. IANA names, so daylight saving is
// handled wherever the shop is.
import Settings from "@/models/Settings";

export const DEFAULT_TIMEZONE = "Asia/Dhaka";

/** A timezone the platform actually recognises, or the default. */
export function safeTimezone(tz) {
  const name = String(tz || "").trim();
  if (!name) return DEFAULT_TIMEZONE;
  try {
    // Throws RangeError for anything Intl doesn't know, which is also what
    // MongoDB would reject — better to fall back than to fail a report.
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

let cache = { at: 0, value: DEFAULT_TIMEZONE };

/** The shop's timezone, read rarely — settings change far less than reports run. */
export async function storeTimezone() {
  if (Date.now() - cache.at < 60_000) return cache.value;
  try {
    const settings = await Settings.findOne().select("general.timezone").lean();
    cache = { at: Date.now(), value: safeTimezone(settings?.general?.timezone) };
  } catch {
    // A report is still worth producing when settings are unreachable.
    cache = { at: Date.now(), value: DEFAULT_TIMEZONE };
  }
  return cache.value;
}

/** Forget the cached value — called when settings are saved. */
export function clearTimezoneCache() {
  cache = { at: 0, value: DEFAULT_TIMEZONE };
}

/**
 * The parts of a moment as the shop sees them.
 *
 * Intl is the only thing in the platform that converts a UTC instant into
 * another zone's calendar fields while respecting daylight saving; doing it
 * by adding a fixed offset is what makes date code wrong twice a year.
 */
function partsIn(date, timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out = {};
  for (const { type, value } of fmt.formatToParts(date)) out[type] = value;
  // Midnight comes back as hour "24" in some runtimes.
  if (out.hour === "24") out.hour = "00";
  return out;
}

/** "2026-10-16" — the calendar date in the shop's zone. */
export function dayKey(date, timezone = DEFAULT_TIMEZONE) {
  const p = partsIn(new Date(date), timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * How far the shop's clock is ahead of UTC at a given moment, in minutes.
 * Worked out from the moment itself, so it is correct on both sides of a
 * daylight-saving change rather than assuming the offset of today.
 */
export function offsetMinutes(date, timezone = DEFAULT_TIMEZONE) {
  const p = partsIn(new Date(date), timezone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - new Date(date).setMilliseconds(0)) / 60000);
}

/** The instant the shop's day containing `date` begins. */
export function startOfDay(date, timezone = DEFAULT_TIMEZONE) {
  const key = dayKey(date, timezone);
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Subtracting the offset at the guessed instant lands on local midnight;
  // one correction pass settles the case where the guess fell on the other
  // side of a daylight-saving boundary.
  const first = guess - offsetMinutes(new Date(guess), timezone) * 60000;
  const corrected = guess - offsetMinutes(new Date(first), timezone) * 60000;
  return new Date(corrected);
}

/** The instant `days` whole shop-days ago began. */
export function startOfDaysAgo(days, timezone = DEFAULT_TIMEZONE, now = Date.now()) {
  const today = startOfDay(new Date(now), timezone);
  return startOfDay(new Date(today.getTime() - days * 864e5 + 3600_000 * 12), timezone);
}

/**
 * Every day between two instants, as the shop counts them: one entry per
 * day, in order, with nothing missing.
 *
 * Zero-filling happens HERE rather than in the browser, because a browser
 * in another timezone rebuilding this list is precisely how the chart's
 * labels came to disagree with its bars.
 */
export function daySpan(from, to, timezone = DEFAULT_TIMEZONE, max = 400) {
  const days = [];
  let cursor = startOfDay(from, timezone);
  const end = new Date(to).getTime();

  while (cursor.getTime() <= end && days.length < max) {
    days.push(dayKey(cursor, timezone));
    // Noon avoids landing on a missing or repeated hour when the clocks change.
    cursor = startOfDay(new Date(cursor.getTime() + 36 * 3600_000), timezone);
  }

  return days;
}

/** "15 Oct" — a short label for a chart axis, in the shop's zone. */
export function dayLabel(dayKeyString, timezone = DEFAULT_TIMEZONE) {
  const [y, m, d] = String(dayKeyString).split("-").map(Number);
  if (!y || !m || !d) return String(dayKeyString);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: timezone }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}
