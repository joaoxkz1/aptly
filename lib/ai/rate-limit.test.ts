import { describe, it, expect } from "vitest";
import { dailyLimitReached, utcDayStartIso } from "./rate-limit";
import { DAILY_GRADE_LIMIT } from "./config";

describe("utcDayStartIso", () => {
  it("returns midnight UTC of the given instant's UTC day", () => {
    expect(utcDayStartIso(new Date("2026-07-01T23:59:59.999Z"))).toBe("2026-07-01T00:00:00.000Z");
    expect(utcDayStartIso(new Date("2026-07-01T00:00:00.000Z"))).toBe("2026-07-01T00:00:00.000Z");
  });

  it("uses the UTC day, not the local day", () => {
    // 01:30 UTC on the 2nd is still the 1st in UTC-3 — the UTC day must win.
    expect(utcDayStartIso(new Date("2026-07-02T01:30:00.000Z"))).toBe("2026-07-02T00:00:00.000Z");
  });
});

describe("dailyLimitReached — pilot cap", () => {
  it("allows grading under the limit", () => {
    expect(dailyLimitReached(0, DAILY_GRADE_LIMIT)).toBe(false);
    expect(dailyLimitReached(DAILY_GRADE_LIMIT - 1, DAILY_GRADE_LIMIT)).toBe(false);
  });

  it("blocks exactly at the limit", () => {
    expect(dailyLimitReached(DAILY_GRADE_LIMIT, DAILY_GRADE_LIMIT)).toBe(true);
  });

  it("blocks past the limit", () => {
    expect(dailyLimitReached(DAILY_GRADE_LIMIT + 5, DAILY_GRADE_LIMIT)).toBe(true);
  });

  it("the pilot limit is 30 per UTC day", () => {
    expect(DAILY_GRADE_LIMIT).toBe(30);
  });
});
