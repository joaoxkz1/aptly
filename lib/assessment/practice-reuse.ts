import type { Attempt, PracticeQuestion } from "@/lib/types";

/**
 * Practice Loop hardening — idempotent generation policy. Pure, no secrets.
 *
 * A refresh, back-navigation, duplicate tab, double-click, or network retry
 * must never buy another paid generation: the generation route first reopens
 * the student's existing unanswered practice question. Only the explicit
 * "Generate another question" action (a server-verified boolean intent)
 * bypasses reuse and creates a replacement.
 *
 * THE REUSE RULE (server-owned):
 *   Reopen the user's LATEST practice question iff
 *     - no saved attempt references it (it is still unanswered), and
 *     - it was created within the last PRACTICE_REUSE_WINDOW_DAYS days.
 *   Otherwise generate a fresh question.
 *
 * Only the latest question is ever eligible: once the student deliberately
 * replaces a question (or answers it), older unanswered ones never resurface,
 * so nobody is trapped in an abandoned task. The modest expiry keeps a weeks-
 * old stale question from reappearing as "current" practice.
 */

export const PRACTICE_REUSE_WINDOW_DAYS = 7;

/** Every practice question some saved attempt (original or revision) answers. */
export function referencedPracticeQuestionIds(attempts: Attempt[]): Set<string> {
  const ids = new Set<string>();
  for (const a of attempts) {
    if (a.practiceQuestionId != null) ids.add(a.practiceQuestionId);
  }
  return ids;
}

/**
 * The one question safe to reopen instead of generating, or null. `latest`
 * is the user's newest practice question (server-fetched, RLS-scoped);
 * `attempts` are their saved attempts. Deterministic and clock-injectable.
 */
export function reusablePracticeQuestion(
  latest: PracticeQuestion | null,
  attempts: Attempt[],
  now: Date = new Date()
): PracticeQuestion | null {
  if (latest === null) return null;
  if (referencedPracticeQuestionIds(attempts).has(latest.id)) return null; // answered
  const ageMs = now.getTime() - new Date(latest.createdAt).getTime();
  if (!(ageMs <= PRACTICE_REUSE_WINDOW_DAYS * 24 * 60 * 60 * 1000)) return null; // expired
  return latest;
}
