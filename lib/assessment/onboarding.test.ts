import { describe, expect, it } from "vitest";
import type { Attempt } from "@/lib/types";
import { deriveOnboardingProgress } from "./onboarding";

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: crypto.randomUUID(),
    createdAt: "2026-08-18T00:00:00Z",
    subject: "Economics",
    topic: "Economics",
    question: "Explain monetary policy. [10 marks]",
    answer: "Answer",
    feedback: {
      score: 4,
      band: null,
      strengths: [],
      improvements: [],
      mistakes: [],
      examinerComment: "",
      studyNext: "",
    },
    ...overrides,
  };
}

describe("real-state onboarding progress", () => {
  it("starts empty and completes only from real product rows", () => {
    expect(deriveOnboardingProgress([], new Set())).toMatchObject({
      completed: 0,
      complete: false,
    });
    const attempts = [
      attempt({
        assessment: {
          scoringState: "marked",
          eligibleForCoreAnalytics: true,
        } as Attempt["assessment"],
      }),
      attempt({ parentAttemptId: crypto.randomUUID() }),
      attempt({ practiceQuestionId: "33333333-3333-4333-8333-333333333333" }),
    ];
    expect(
      deriveOnboardingProgress(
        attempts,
        new Set(["33333333-3333-4333-8333-333333333333"])
      )
    ).toMatchObject({ completed: 3, complete: true });
  });

  it("does not count a generic Practice answer as Current Focus practice", () => {
    const progress = deriveOnboardingProgress(
      [attempt({ practiceQuestionId: "33333333-3333-4333-8333-333333333333" })],
      new Set()
    );
    expect(progress.answeredCurrentFocusPractice).toBe(false);
  });
});
