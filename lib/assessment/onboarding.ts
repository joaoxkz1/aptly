import type { Attempt } from "@/lib/types";

export interface OnboardingProgress {
  firstMarkedAnswer: boolean;
  completedRevision: boolean;
  answeredCurrentFocusPractice: boolean;
  completed: number;
  complete: boolean;
}
export function deriveOnboardingProgress(
  attempts: Attempt[],
  currentFocusPracticeIds: ReadonlySet<string>
): OnboardingProgress {
  const firstMarkedAnswer = attempts.some(
    (attempt) =>
      attempt.assessment?.scoringState === "marked" ||
      attempt.assessment?.eligibleForCoreAnalytics === true
  );
  const completedRevision = attempts.some((attempt) => attempt.parentAttemptId != null);
  const answeredCurrentFocusPractice = attempts.some(
    (attempt) =>
      attempt.practiceQuestionId != null &&
      currentFocusPracticeIds.has(attempt.practiceQuestionId)
  );
  const completed = [
    firstMarkedAnswer,
    completedRevision,
    answeredCurrentFocusPractice,
  ].filter(Boolean).length;
  return {
    firstMarkedAnswer,
    completedRevision,
    answeredCurrentFocusPractice,
    completed,
    complete: completed === 3,
  };
}
