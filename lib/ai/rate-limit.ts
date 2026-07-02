/**
 * Pilot daily grading limit — pure helpers (no secrets, unit-tested).
 *
 * The grade route counts the authenticated user's SAVED attempts created since
 * the start of the current UTC day (RLS already scopes the count to the user)
 * and refuses to call the paid model once the limit is reached. Feedback-only
 * grades count too — they use the same grading capacity.
 */

/** ISO timestamp for the start of the current UTC day. */
export function utcDayStartIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

/** True when a user with `count` grades saved today has no capacity left. */
export function dailyLimitReached(count: number, limit: number): boolean {
  return count >= limit;
}
