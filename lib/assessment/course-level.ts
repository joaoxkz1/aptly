export const ECONOMICS_COURSE_LEVELS = ["sl", "hl"] as const;

export type EconomicsCourseLevel = (typeof ECONOMICS_COURSE_LEVELS)[number];

export const PRACTICE_MARK_TOTALS = [2, 10, 15] as const;
export type PracticeMarkTotal = (typeof PRACTICE_MARK_TOTALS)[number];

export function readEconomicsCourseLevel(userMetadata: unknown): EconomicsCourseLevel | null {
  if (userMetadata == null || typeof userMetadata !== "object") return null;
  const value = (userMetadata as Record<string, unknown>).economics_level;
  return typeof value === "string" &&
    (ECONOMICS_COURSE_LEVELS as readonly string[]).includes(value)
    ? (value as EconomicsCourseLevel)
    : null;
}
