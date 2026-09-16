import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Attempt } from "@/lib/types";
import { answerPracticeFocus, currentPracticeFocus, FOCUS_INSTRUCTIONS } from "./focused-practice";
import { buildLearningInsights } from "./readiness";
import { scopeFeedbackToQuestion } from "./feedback-scope";

function recordedEssay(): Attempt {
  const record = JSON.parse(readFileSync(new URL("../../docs/diagram-live-validation/attempts/13-live-12/result.json", import.meta.url), "utf8"));
  return record.response.attempt as Attempt;
}

function healthyOtherTopic(attempt: Attempt): Attempt {
  const healthy = structuredClone(attempt);
  healthy.id = "healthy-other-topic";
  healthy.assessment!.syllabusTopic = "1.1";
  healthy.assessment!.syllabusUnit = "unit_1";
  healthy.assessment!.marksEarned = healthy.assessment!.marksAvailable;
  healthy.assessment!.markBreakdown.forEach(row => { row.awarded = row.available; });
  healthy.feedback.mistakes = [];
  return healthy;
}

describe("question-scoped feedback", () => {
  it("repairs the recorded stakeholder essay's policy advice without changing marks or evidence", () => {
    const attempt = recordedEssay();
    const before = structuredClone(attempt);
    const feedback = scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, attempt.question);
    expect(feedback.improvements).toEqual([attempt.feedback.improvements[0]]);
    expect(feedback.studyNext).toBe(FOCUS_INSTRUCTIONS.application);
    expect(feedback.mistakes).toEqual(["No real-world example"]);
    expect(feedback.strengths).toEqual(attempt.feedback.strengths);
    expect(attempt).toEqual(before);
    expect(attempt.assessment).toMatchObject({ marksEarned: 12, marksAvailable: 15, marksAssessable: 15 });
    expect(scopeFeedbackToQuestion(feedback, attempt.assessment!, attempt.question)).toEqual(feedback);
  });

  it("keeps answer and global practice focused on the actual application deficit", () => {
    const attempt = recordedEssay();
    const healthy = healthyOtherTopic(attempt);
    const baseline = buildLearningInsights([attempt, healthy]);
    attempt.feedback = scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, attempt.question);
    expect(answerPracticeFocus(attempt)).toMatchObject({ targetSkill: "application", recommendedMarks: 15 });
    const insights = buildLearningInsights([attempt, healthy]);
    expect(insights).toEqual(baseline);
    expect(insights.nextFocus).toMatchObject({ skillLabel: "Application to context", topicCode: "3.2" });
    expect(currentPracticeFocus(insights.nextFocus)).toMatchObject({ targetSkill: "application", recommendedMarks: 15 });
    expect(insights.skillPriority.some(row => row.label === "Policy recommendation")).toBe(false);
    expect(buildLearningInsights([attempt]).nextFocus).toBeNull();
  });

  it.each([
    "Recommend a policy response to the supply shock. [15 marks]",
    "Propose a policy to reduce cyclical unemployment. [10 marks]",
    "Which policy would be most appropriate for reducing unemployment? [15 marks]",
    "Evaluate which is the best policy for this economy. [15 marks]",
    "Suggest a policy to reduce unemployment. [10 marks]",
    "Give a policy recommendation for this economy. [10 marks]",
  ])("retains recommendation advice when explicitly requested: %s", question => {
    const attempt = recordedEssay();
    expect(scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, question)).toEqual(attempt.feedback);
  });

  it("does not mistake accurate analysis of policy effects for a recommendation", () => {
    const attempt = recordedEssay();
    attempt.feedback.improvements = [
      "Explain how higher interest rates reduce investment and aggregate demand.",
      "Explain how the policy recommendation in the passage would affect firms' costs.",
    ];
    attempt.feedback.studyNext = "Trace the policy's effects on borrowing, spending and employment.";
    expect(scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, "Discuss the effects of monetary policy on stakeholders. [15 marks]"))
      .toEqual(attempt.feedback);
  });

  it("does not treat a generic fifteen-mark policy topic as a recommendation requirement", () => {
    const attempt = recordedEssay();
    attempt.assessment!.framework = "generic_practice";
    const feedback = scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, "Discuss how a supply-side policy affects stakeholders. [15 marks]");
    expect(feedback.studyNext).toBe(FOCUS_INSTRUCTIONS.application);
    expect(feedback.improvements).toHaveLength(1);
  });

  it("labels optional extensions clearly and keeps them behind a diagnosed improvement", () => {
    const attempt = recordedEssay();
    attempt.feedback.improvements = ["Optional extension: compare the effects in another industry."];
    attempt.feedback.studyNext = "Optional: compare another industry.";
    const feedback = scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, attempt.question);
    expect(feedback.improvements).toEqual(["Optional extension (not needed for credit): compare the effects in another industry."]);
    expect(feedback.studyNext).toBe(FOCUS_INSTRUCTIONS.application);
    attempt.assessment!.markBreakdown.forEach(row => { row.awarded = row.available; });
    attempt.feedback.mistakes = [];
    expect(scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, attempt.question).studyNext)
      .toBe("Optional extension (not needed for credit): compare another industry.");
  });

  it("does not request an out-of-scope policy recommendation even if it was called optional", () => {
    const attempt = recordedEssay();
    attempt.feedback.improvements = ["Optional extension: recommend a policy response under different conditions."];
    attempt.feedback.studyNext = "Optional: recommend the most appropriate policy.";
    const feedback = scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, attempt.question);
    expect(feedback.improvements).toEqual([]);
    expect(feedback.studyNext).toBe(FOCUS_INSTRUCTIONS.application);
  });

  it("drops unrequested mandatory policy advice when no supported deficit establishes replacement advice", () => {
    const attempt = recordedEssay();
    attempt.assessment!.markBreakdown.forEach(row => { row.awarded = row.available; });
    attempt.feedback.mistakes = [];
    const feedback = scopeFeedbackToQuestion(attempt.feedback, attempt.assessment!, attempt.question);
    expect(feedback.studyNext).toBe(feedback.improvements[0]);
    expect(feedback.improvements).toHaveLength(1);
  });
});
