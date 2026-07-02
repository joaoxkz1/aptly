import { describe, expect, it } from "vitest";
import type { Attempt, Feedback, PracticeQuestion } from "@/lib/types";
import {
  PRACTICE_REUSE_WINDOW_DAYS,
  referencedPracticeQuestionIds,
  reusablePracticeQuestion,
} from "./practice-reuse";

const NOW = new Date("2026-07-02T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function practiceQuestion(o: Partial<PracticeQuestion> = {}): PracticeQuestion {
  return {
    id: "pq-1",
    createdAt: daysBefore(1),
    question: "Explain the effect of a subsidy on market price. [10 marks]",
    sourceMaterial: null,
    framework: "generic_practice",
    markTotal: 10,
    topicCode: "2.5",
    topicLabel: "Government Intervention",
    skill: "economic_analysis",
    why: "Evidence-backed reason.",
    ...o,
  };
}

function feedback(): Feedback {
  return {
    score: 5,
    band: "internal",
    strengths: ["s"],
    improvements: ["i"],
    mistakes: [],
    examinerComment: "c",
    studyNext: "n",
  };
}

function attempt(o: Partial<Attempt> = {}): Attempt {
  return {
    id: "a-1",
    createdAt: daysBefore(1),
    subject: "Economics",
    topic: "Economics",
    question: "Q",
    answer: "A",
    feedback: feedback(),
    assessment: null,
    parentAttemptId: null,
    practiceQuestionId: null,
    ...o,
  };
}

describe("reusablePracticeQuestion — refresh reopens, never regenerates", () => {
  it("reopens the latest question when it is unanswered and recent", () => {
    const latest = practiceQuestion();
    expect(reusablePracticeQuestion(latest, [attempt()], NOW)).toBe(latest);
  });

  it("returns null when the user has no practice questions", () => {
    expect(reusablePracticeQuestion(null, [], NOW)).toBeNull();
  });

  it("does NOT reuse a question once any attempt answers it", () => {
    const latest = practiceQuestion({ id: "pq-1" });
    const answered = attempt({ practiceQuestionId: "pq-1" });
    expect(reusablePracticeQuestion(latest, [answered], NOW)).toBeNull();
  });

  it("a REVISION referencing the question also counts as answered", () => {
    const latest = practiceQuestion({ id: "pq-1" });
    const revision = attempt({ id: "a-2", parentAttemptId: "gone", practiceQuestionId: "pq-1" });
    expect(reusablePracticeQuestion(latest, [revision], NOW)).toBeNull();
  });

  it("attempts on OTHER practice questions do not block reuse", () => {
    const latest = practiceQuestion({ id: "pq-2" });
    const other = attempt({ practiceQuestionId: "pq-1" });
    expect(reusablePracticeQuestion(latest, [other], NOW)).toBe(latest);
  });

  it("expires: a question older than the server-owned window is not reused", () => {
    const inside = practiceQuestion({ createdAt: daysBefore(PRACTICE_REUSE_WINDOW_DAYS - 1) });
    expect(reusablePracticeQuestion(inside, [], NOW)).toBe(inside);

    const outside = practiceQuestion({ createdAt: daysBefore(PRACTICE_REUSE_WINDOW_DAYS + 1) });
    expect(reusablePracticeQuestion(outside, [], NOW)).toBeNull();
  });

  it("an unparseable createdAt fails safe (no reuse, fresh generation)", () => {
    const corrupt = practiceQuestion({ createdAt: "not-a-date" });
    expect(reusablePracticeQuestion(corrupt, [], NOW)).toBeNull();
  });
});

describe("referencedPracticeQuestionIds", () => {
  it("collects every linked id across originals and revisions, ignoring nulls", () => {
    const ids = referencedPracticeQuestionIds([
      attempt({ id: "a-1", practiceQuestionId: "pq-1" }),
      attempt({ id: "a-2", practiceQuestionId: "pq-1", parentAttemptId: "a-1" }),
      attempt({ id: "a-3", practiceQuestionId: "pq-2" }),
      attempt({ id: "a-4" }),
    ]);
    expect(ids).toEqual(new Set(["pq-1", "pq-2"]));
  });
});
