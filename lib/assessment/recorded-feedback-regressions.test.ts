import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Attempt } from "@/lib/types";
import { validateCombinedGrade } from "@/lib/ai/combined-assessment";
import type { AssessedVisualEvidence } from "@/lib/ai/assessed-visual-schema";
import { AnswerNextStep } from "@/components/assessment/answer-next-step";
import { answerPracticeFocus, currentPracticeFocus, FOCUS_INSTRUCTIONS } from "./focused-practice";
import { policyForGeneratedPractice } from "./policy";
import { buildLearningInsights, recurringMistakeSummary } from "./readiness";
import { policyWithContract, type TrustedAssessmentContract } from "./trusted-contract";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

// Offline replay of captured responses only. No provider client or dispatch is
// imported, and the immutable live records are never rewritten by these tests.
function readRecord(folder: string, file: string) {
  return JSON.parse(readFileSync(new URL(`../../docs/diagram-live-validation/attempts/${folder}/${file}`, import.meta.url), "utf8"));
}
function outputText(folder: string, file: string) {
  const wrapper = readRecord(folder, file) as { response: { output: { content?: { type: string; text?: string }[] }[] } };
  const content = wrapper.response.output.flatMap(item => item.content ?? []).find(item => item.type === "output_text");
  if (!content?.text) throw new Error(`No captured output in ${folder}/${file}`);
  return JSON.parse(content.text);
}
function replay(folder: string) {
  const saved = readRecord(folder, "result.json").response.attempt as Attempt;
  const task = readRecord(folder, "resolved-task.json") as {
    question: string; answer: string; sourceMaterial: string | null; imageHash: string; contract: TrustedAssessmentContract;
  };
  const raw = outputText(folder, "grader-response.json");
  const untouchedRaw = structuredClone(raw);
  const policy = policyWithContract(policyForGeneratedPractice({
    framework: task.contract.framework, markTotal: task.contract.total, sourceMaterial: task.sourceMaterial,
  }), task.contract);
  const result = validateCombinedGrade(raw, {
    policy, contract: task.contract,
    visual: outputText(folder, "observer-response.json") as AssessedVisualEvidence,
    attachmentHashes: [task.imageHash], snapshotId: saved.assessment!.assessedDiagram!.snapshotId,
    hasExplanation: Boolean(task.answer.trim()), question: task.question,
  });
  expect(raw).toEqual(untouchedRaw);
  return { saved, task, raw, normalized: { ...saved, assessment: result.assessment, feedback: result.feedback } satisfies Attempt };
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
function nextStep(attempt: Attempt) {
  return renderToStaticMarkup(React.createElement(AnswerNextStep, {
    attempt, saved: true, onTryAnother() {}, tryAnotherLabel: "Try another answer",
  }));
}

describe("captured feedback corrections preserve the learning loop", () => {
  it.each([
    ["05-live-05", "economic_analysis", "Economic analysis", 10],
    ["07-live-07", "economic_analysis", "Economic analysis", 10],
    ["13-live-12", "application", "Application to context", 15],
    ["17-live-14", "diagram_explanation", "Diagram", 4],
  ] as const)("%s preserves marks and targets %s", (folder, skill, diagnostic, marks) => {
    const { saved, normalized } = replay(folder);
    expect(normalized.assessment).toMatchObject({
      marksEarned: saved.assessment!.marksEarned,
      marksAvailable: saved.assessment!.marksAvailable,
      marksAssessable: saved.assessment!.marksAssessable,
    });
    expect(normalized.assessment!.assessedDiagram!.componentDecision)
      .toEqual(saved.assessment!.assessedDiagram!.componentDecision);
    expect(answerPracticeFocus(normalized)).toMatchObject({ targetSkill: skill, recommendedMarks: marks });
    expect(buildLearningInsights([normalized]).nextFocus).toBeNull();
    const healthy = healthyOtherTopic(saved);
    const before = buildLearningInsights([saved, healthy]);
    const after = buildLearningInsights([normalized, healthy]);
    expect(after.weightedPercent).toBe(before.weightedPercent);
    expect(after.level).toEqual(before.level);
    expect(after.markTrend).toEqual(before.markTrend);
    expect(after.skillPriority).toEqual(before.skillPriority);
    expect(after.nextFocus).toMatchObject({ skillLabel: diagnostic, topicCode: normalized.assessment!.syllabusTopic });
    expect(currentPracticeFocus(after.nextFocus)).toMatchObject({ targetSkill: skill, recommendedMarks: marks });
    expect(normalized.feedback.mistakes).not.toContain("Missing diagram explanation");
  });

  it.each(["05-live-05", "07-live-07"])("%s diagnoses incomplete or absent writing without calling it incorrect", folder => {
    const { normalized } = replay(folder);
    expect(normalized.feedback.mistakes).toContain("Underdeveloped economic analysis");
    expect(normalized.feedback.mistakes).not.toContain("Incorrect diagram explanation");
    expect(normalized.feedback.mistakes).not.toContain("Missing required diagram");
    expect(normalized.assessment!.markBreakdown.find(row => row.label === "Diagram")?.awarded).toBe(4);
    const html = nextStep(normalized);
    expect(html).toContain("skill=economic_analysis");
    expect(html).not.toContain("skill=diagram_explanation");
    if (folder === "07-live-07") {
      expect(normalized.feedback.examinerComment).toContain("no typed written explanation");
      expect(html).toContain("Revise the limiting part");
      expect(html).toContain("Explain the causal change and resulting outcome shown in your diagram.");
    } else {
      expect(html).toContain(FOCUS_INSTRUCTIONS.economic_analysis);
    }
  });

  it("does not carry the two false incorrect-diagram tags into a recurring pattern", () => {
    const first = replay("05-live-05").normalized;
    const second = replay("07-live-07").normalized;
    const patterns = recurringMistakeSummary([first, second, healthyOtherTopic(first)]);
    expect(patterns.patterns).toContainEqual({ type: "Underdeveloped economic analysis", attempts: 2 });
    expect(patterns.patterns.some(pattern => pattern.type === "Incorrect diagram explanation")).toBe(false);
  });

  it("keeps the stakeholder essay's next action on application rather than an unrequested policy recommendation", () => {
    const { normalized } = replay("13-live-12");
    expect(normalized.feedback.studyNext).toBe(FOCUS_INSTRUCTIONS.application);
    expect(normalized.feedback.improvements.join(" ")).not.toMatch(/prioriti[sz]e.*policy|policy recommendation/i);
    expect(normalized.feedback.mistakes).toEqual(["No real-world example"]);
    expect(normalized.assessment!.markBreakdown.some(row => row.label === "Policy recommendation")).toBe(false);
    expect(normalized.assessment!.markBreakdown.find(row => row.label === "Evaluation and judgment")?.awarded).toBe(4);
    const html = nextStep(normalized);
    expect(html).toContain("skill=application");
    expect(html).not.toContain("policy recommendation");
    expect(html).not.toContain("skill=policy_recommendation");
  });

  it("treats the irrelevant PPC as a missing relevant family without a labeling penalty or written deduction", () => {
    const { raw, normalized } = replay("17-live-14");
    expect(raw.componentEvaluation.labelingDeficiency).toBe(true);
    expect(normalized.feedback.mistakes).toContain("Missing required diagram");
    expect(normalized.feedback.mistakes).not.toContain("Underdeveloped economic analysis");
    expect(normalized.assessment!.assessedDiagram!.componentDecision).toMatchObject({ diagram: 0, explanation: 2, ceilings: [] });
    expect(normalized.assessment!.capReason).toBeNull();
    expect(normalized.feedback.studyNext).toContain("diagram family required by this question");
    expect(normalized.feedback.studyNext).not.toMatch(/correct.*labels/i);
    const html = nextStep(normalized);
    expect(html).toContain("Revise the limiting part");
    expect(html).toContain("diagram family required by this question");
    expect(html).toContain("skill=diagram_explanation");
  });
});
