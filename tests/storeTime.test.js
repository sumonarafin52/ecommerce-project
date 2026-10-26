// tests/storeTime.test.js
//
// Which day an order belongs to.
//
// The bug these cover was invisible: every figure looked plausible, it was
// just about the wrong day. A shop in Dhaka (UTC+6) had its daily revenue
// bucketed by MongoDB in UTC, its "today" cut from the server's clock, and
// its chart labels built from the browser's — so an order taken at 2am
// local time was reported under yesterday, and the labels didn't line up
// with the bars.
import { describe, it, expect } from "vitest";
import { dayKey, startOfDay, startOfDaysAgo, daySpan, dayLabel, safeTimezone, offsetMinutes } from "@/lib/storeTime";

const DHAKA = "Asia/Dhaka";

describe("which day an order belongs to", () => {
  it("files a late-night Dhaka order under the Dhaka date", () => {
    // 02:30 on the 16th in Dhaka is 20:30 on the 15th in UTC.
    const order = new Date("2026-10-15T20:30:00.000Z");
    expect(dayKey(order, DHAKA)).toBe("2026-10-16");
    expect(dayKey(order, "UTC")).toBe("2026-10-15"); // what it used to do
  });

  it("files an early-evening order under the same day in both", () => {
    const order = new Date("2026-10-15T09:00:00.000Z"); // 3pm in Dhaka
    expect(dayKey(order, DHAKA)).toBe("2026-10-15");
  });

  it("starts the day at local midnight, not UTC midnight", () => {
    const start = startOfDay(new Date("2026-10-16T05:00:00.000Z"), DHAKA);
    // Dhaka is six hours ahead, so its midnight is 18:00 UTC the day before.
    expect(start.toISOString()).toBe("2026-10-15T18:00:00.000Z");
  });

  it("knows how far ahead the shop's clock is", () => {
    expect(offsetMinutes(new Date("2026-10-15T12:00:00Z"), DHAKA)).toBe(360);
    expect(offsetMinutes(new Date("2026-10-15T12:00:00Z"), "UTC")).toBe(0);
  });
});

describe("timezones that observe daylight saving", () => {
  it("uses the offset in force at that moment, not today's", () => {
    // London is UTC+1 in July and UTC+0 in January. Adding a fixed offset
    // is what makes date code wrong twice a year.
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/London")).toBe(60);
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/London")).toBe(0);
  });

  it("puts a summer late-night London order on the right day", () => {
    // 00:30 on the 16th in London is 23:30 on the 15th in UTC.
    expect(dayKey(new Date("2026-07-15T23:30:00Z"), "Europe/London")).toBe("2026-07-16");
  });

  it("still produces one entry per day across a clock change", () => {
    // The weekend British clocks go back: 25 October 2026.
    const days = daySpan(new Date("2026-10-23T12:00:00Z"), new Date("2026-10-27T12:00:00Z"), "Europe/London");
    expect(days).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  });
});

describe("the series the chart draws", () => {
  it("lists every day in order, with none missing", () => {
    // The ends are instants, and the days between them are the SHOP's.
    // 17:59 UTC is 23:59 in Dhaka, so this is the 10th to the 14th there —
    // an hour later and the 15th has already begun for the shop.
    const days = daySpan(new Date("2026-10-09T18:00:00Z"), new Date("2026-10-14T17:59:59Z"), DHAKA);
    expect(days).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);

    const oneHourLater = daySpan(new Date("2026-10-09T18:00:00Z"), new Date("2026-10-14T18:30:00Z"), DHAKA);
    expect(oneHourLater).toContain("2026-10-15");
  });

  it("covers a single day without collapsing to nothing", () => {
    const days = daySpan(new Date("2026-10-10T06:00:00Z"), new Date("2026-10-10T12:00:00Z"), DHAKA);
    expect(days).toEqual(["2026-10-10"]);
  });

  it("refuses to build an unbounded list", () => {
    // A hand-typed date range of "1970 to now" must not try to render
    // twenty thousand bars.
    const days = daySpan(new Date("1970-01-01"), new Date("2026-10-10"), DHAKA);
    expect(days.length).toBeLessThanOrEqual(400);
  });

  it("counts days back on the shop's calendar", () => {
    const now = new Date("2026-10-16T02:00:00Z").getTime(); // 8am in Dhaka
    expect(dayKey(startOfDaysAgo(0, DHAKA, now), DHAKA)).toBe("2026-10-16");
    expect(dayKey(startOfDaysAgo(6, DHAKA, now), DHAKA)).toBe("2026-10-10");
  });

  it("labels a day the way a person reads it", () => {
    expect(dayLabel("2026-10-15", DHAKA)).toBe("15 Oct");
  });
});

describe("a timezone the platform doesn't know", () => {
  it("falls back rather than breaking every report", () => {
    // MongoDB rejects an unknown zone outright, so a typo in settings would
    // otherwise take the whole reports page down.
    expect(safeTimezone("Mars/Olympus_Mons")).toBe("Asia/Dhaka");
    expect(safeTimezone("")).toBe("Asia/Dhaka");
    expect(safeTimezone(null)).toBe("Asia/Dhaka");
    expect(safeTimezone("Europe/London")).toBe("Europe/London");
  });
});
