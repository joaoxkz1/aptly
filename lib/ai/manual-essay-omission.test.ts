import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnswerNextStep } from "@/components/assessment/answer-next-step";
import { answerPracticeFocus } from "@/lib/assessment/focused-practice";
import { buildLearningInsights } from "@/lib/assessment/readiness";
import { markPresentation } from "@/lib/assessment/status";
import { resolveScoringPolicy } from "@/lib/assessment/policy";
import { SAMPLE_WALKTHROUGH_ATTEMPT } from "@/lib/assessment/sample-walkthrough";
import { policyWithContract, publicContract, resolveAssessmentContract } from "@/lib/assessment/trusted-contract";
import type { Attempt } from "@/lib/types";
import { combinedAssessmentInstructions, validateCombinedGrade } from "./combined-assessment";
import { buildAssessmentInstructions, buildAssessmentUserInput } from "./assessment-schema";
import { ANSWER, QUESTION } from "./fixtures/pollution-production-answer";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

// Offline regression using the reported prose and reconstructed structured
// feedback. Its reported 10 is an input to reconciliation, never a target mark.
// Sources for the counterexamples: docs/manual-essay-diagram-source-notes.md.
const OPTIONAL_DEBT = "Explain why sustainable national debt is an important macroeconomic objective. [10]";
const SUPPORTIVE_INFLATION = "Explain why a high rate of inflation may lead to a redistribution of income. [10]";

function manual(question = QUESTION, total: 10 | 15 = 10) {
  const policy = resolveScoringPolicy(question, {
    requestedSource: null, requestedTotal: null,
    requestedFramework: total === 10 ? "paper1a_10_mark" : "paper1b_15_mark",
    templateId: null, sourceMaterial: null,
  });
  const contract = resolveAssessmentContract({ policy, question, topic: "2.8", sourceMaterial: null })!;
  return { question, policy: policyWithContract(policy, contract), contract,
    visual: null, attachmentHashes: [], snapshotId: "reported-pollution-omission", hasExplanation: Boolean(ANSWER.trim()) };
}

function reportedOutput(mark = 10, overrides: Record<string, unknown> = {}) {
  return {
    strengths: [
      "Accurately explains pollution as a negative externality of production and defines the external cost borne by third parties.",
      "Develops the full causal chain from MSC exceeding MPC to overproduction, allocative inefficiency and welfare loss.",
      "Uses the coal-fired electricity example effectively to apply the analysis to a realistic context.",
    ],
    improvements: ["Optional extension (not needed for credit): explicitly state the standard assumption that marginal social benefit equals marginal private benefit, so the market output is determined where MPC = MPB/MSB."],
    mistakes: [],
    examinerComment: "Estimated practice mark: this is a fully focused and coherent explanation. It accurately distinguishes private from social costs, explains why firms do not internalize pollution costs, and clearly links the resulting overproduction to welfare loss. The example is relevant and integrated into the reasoning. No diagram was required under this task’s framework.",
    studyNext: "Practise explaining how a per-unit indirect tax can internalize the external cost and move output from the free-market quantity toward the socially efficient quantity.",
    assessmentFormat: "paper_1_a", paper: "paper_1", questionPart: "a", levelRelevance: "shared_sl_hl",
    assessmentSkills: ["knowledge", "economic_analysis", "application", "structure"], commandTerm: "explain", commandTermLabel: "Explain",
    syllabusUnit: "unit_2", syllabusTopic: "2.8", topicLabel: "Market failure — externalities and common pool/common access resources",
    classificationConfidence: "high", markingConfidence: "high", diagramExpected: false, diagramSubmitted: false,
    diagramAssessmentStatus: "not_relevant", workingsExpected: false, workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant", attachmentContent: "none", assessableEarned: mark,
    markBreakdown: [
      { label: "Knowledge and terminology", awarded: 4, available: 4, reason: "Uses accurate terminology throughout, including market failure, negative externality of production, MPC, MSC and allocative inefficiency." },
      { label: "Economic analysis", awarded: 4, available: 4, reason: "Clearly explains the divergence between MPC and MSC, the market output above the socially efficient output, and the welfare loss from units where social cost exceeds social benefit." },
      { label: "Application to context", awarded: 4, available: 4, reason: "The coal-fired electricity example is relevant and is directly used to show how unpriced emissions are excluded from firms' production decisions." },
      { label: "Structure and clarity", awarded: 4, available: 4, reason: "The response is logically sequenced from definition and example through cost analysis to a clear conclusion." },
    ],
    bandRationale: "The relevant theory is fully explained and accurate terminology is used throughout.",
    limitations: [], componentEvaluation: null, ...overrides,
  };
}

function replay(mark = 10) {
  const raw = reportedOutput(mark);
  const before = structuredClone(raw);
  const result = validateCombinedGrade(raw, manual());
  expect(raw).toEqual(before);
  const attempt: Attempt = {
    ...structuredClone(SAMPLE_WALKTHROUGH_ATTEMPT), id: "pollution-omission-regression",
    question: QUESTION, answer: ANSWER, assessment: result.assessment, feedback: result.feedback,
  };
  return { ...result, attempt };
}

function renderedAnswerNextStep(attempt: Attempt) {
  return renderToStaticMarkup(React.createElement(AnswerNextStep, {
    attempt, saved: true, onTryAnother() {}, tryAnotherLabel: "Try another answer",
  }));
}

describe("manual Paper 1 task-specific diagram roles", () => {
  it("recognizes the reported pollution mechanism without explicit diagram wording", () => {
    const { contract, policy } = manual();
    expect(contract).toMatchObject({
      mode: "holistic_diagram", diagramRole: "necessary_for_task", provenance: "inferred_practice",
      blueprintVersion: "inferred-essay-contract-v1", diagram: { family: "externality" },
    });
    const criteria = JSON.stringify(contract.diagram);
    expect(criteria).toMatch(/MSC/);
    expect(criteria).toMatch(/MPC/);
    expect(criteria).toMatch(/welfare|social.*optim|over.?alloc|overproduc/i);
    expect(policy).toMatchObject({ bestFit: true, assessable: 10, capReason: null, cappedDiagramMarks: 0, scoringState: "marked" });
    expect(contract.essayResolution).toMatchObject({ ruleId: "negative-production-externality", confidence: "mechanism_matched", basis: expect.any(Array) });
    expect(publicContract(contract)).not.toHaveProperty("essayResolution");
    expect(publicContract(contract)).not.toHaveProperty("diagram");
  });

  it("preserves an explicitly diagram-optional macroeconomic objective task", () => {
    const opts = manual(OPTIONAL_DEBT);
    expect(opts.contract.diagramRole).toBe("optional");
    const result = validateCombinedGrade(reportedOutput(10, { studyNext: "Review the explanation of debt servicing and future fiscal choices." }), opts);
    expect(result.assessment).toMatchObject({ marksEarned: 10, capReason: null, diagramExpected: false });
    expect(result.feedback.mistakes).not.toContain("Missing required diagram");
    expect(result.assessment.markBreakdown.some(row => row.label === "Diagram")).toBe(false);
  });

  it("retains useful nonessential support without fabricating a missing requirement", () => {
    const opts = manual(SUPPORTIVE_INFLATION);
    expect(opts.contract.diagramRole).toBe("appropriate_support");
    const result = validateCombinedGrade(reportedOutput(10), opts);
    expect(result.assessment.marksEarned).toBe(10);
    expect(result.assessment.capReason).toBeNull();
    expect(result.feedback.mistakes).not.toContain("Missing required diagram");
    expect(result.assessment.markBreakdown.some(row => row.label === "Diagram")).toBe(false);
  });

  it("gives explicit diagram wording the strongest role", () => {
    const opts = manual("Using an AD/AS diagram, explain how falling consumer confidence changes real output. [10]");
    expect(opts.contract).toMatchObject({ diagramRole: "required_explicitly", diagram: { family: "ad_as" } });
    expect(opts.policy).toMatchObject({ bestFit: true, capReason: null, cappedDiagramMarks: 0 });
  });

  it("keeps a genuinely unresolved manual task provisional instead of silently optional", () => {
    const opts = manual("Explain the economic significance of the situation. [10]");
    expect(opts.contract.diagramRole).toBe("unresolved");
    expect(opts.policy.scoringState).toBe("provisional");
    expect(opts.contract.diagramReason).toMatch(/provisional|unresolved|not.*established/i);
    const result = validateCombinedGrade(reportedOutput(), opts);
    const attempt = { ...structuredClone(SAMPLE_WALKTHROUGH_ATTEMPT), assessment: result.assessment, feedback: result.feedback };
    expect(markPresentation(attempt).reason).toContain("diagram expectation is unresolved");
    expect(markPresentation(attempt).reason).not.toContain("Inferred mark total");
  });
});

describe("reported missing-diagram feedback and independent holistic mark", () => {
  it.each([7, 8, 9, 10])("preserves the authoritative grader's %i without a mechanical omission penalty", mark => {
    const { assessment, feedback } = replay(mark);
    expect(assessment).toMatchObject({ marksEarned: mark, marksAvailable: 10, marksAssessable: 10,
      capReason: null, diagramExpected: true, diagramSubmitted: false, diagramMarksUnavailable: null });
    expect(assessment.assessedDiagram).toMatchObject({ state: "not_provided", componentDecision: null,
      contract: { diagramRole: "necessary_for_task" } });
    expect(assessment.markBreakdown.find(row => row.label === "Diagram")).toMatchObject({ awarded: 0, available: 4 });
    expect(assessment.markBreakdown.filter(row => row.label !== "Diagram").every(row => row.awarded === 4)).toBe(true);
    expect(feedback.mistakes).toContain("Missing required diagram");
    expect(feedback.mistakes).not.toContain("Underdeveloped economic analysis");
    expect(feedback.mistakes).not.toContain("Incorrect diagram explanation");
    expect(feedback.improvements[0]).toMatch(/diagram/i);
    expect(feedback.improvements[0]).not.toMatch(/^Optional extension/);
    const text = [feedback.examinerComment, ...feedback.improvements, feedback.studyNext].join(" ");
    expect(text).toMatch(/MSC/);
    expect(text).toMatch(/MPC/);
    expect(text).not.toMatch(/no diagram was required|no diagram is required/i);
    expect(feedback.studyNext).not.toMatch(/indirect.tax|policy recommendation/i);
  });

  it("creates a diagram priority despite excellent written diagnostics", () => {
    const { attempt } = replay();
    expect(answerPracticeFocus(attempt)).toMatchObject({ targetSkill: "diagram_explanation" });
    const html = renderedAnswerNextStep(attempt);
    expect(html).not.toContain("does not establish one clear supported priority");
    expect(html).toContain("skill=diagram_explanation");
    expect(html).not.toMatch(/indirect.tax|policy recommendation/i);
    expect(attempt.answer).toBe(ANSWER);
  });
  it("carries the supported omission into Current Focus without changing historical marks", () => {
    const { attempt } = replay();
    const other = structuredClone(attempt); other.id = "other-topic";
    other.assessment!.syllabusTopic = "3.2";
    other.assessment!.markBreakdown = other.assessment!.markBreakdown.filter(row => row.label !== "Diagram");
    other.feedback.mistakes = [];
    const before = JSON.stringify([attempt, other]);
    const insights = buildLearningInsights([attempt, other]);
    expect(insights.skillPriority.find(row => row.label === "Diagram")?.lost).toBeGreaterThan(0);
    expect(insights.nextFocus).toMatchObject({ skillLabel: "Diagram", topicCode: "2.8" });
    expect(JSON.stringify([attempt, other])).toBe(before);
  });

  it("sends task-specific absence into best fit without supplying a forecast score", () => {
    const text = combinedAssessmentInstructions(manual().contract);
    expect(text).toContain("necessary_for_task");
    expect(text).toMatch(/best.fit/i);
    expect(text).toMatch(/MSC/);
    expect(text).toMatch(/MPC/);
    expect(text).toMatch(/missing|omission|absen/i);
    expect(text).toMatch(/no fixed|never a fixed|not a fixed/i);
    expect(text).not.toMatch(/expected mark\s*=|calibration target|safest calibration|around 6\/10|around 9\/10/i);
  });

  it("preserves the reported answer verbatim in the grader input without the surrounding teacher predictions", () => {
    const { policy } = manual();
    const text = buildAssessmentUserInput("Economics", "2.8", QUESTION, ANSWER, "Use the applicable Paper 1(a) best-fit rubric.", false, policy, null);
    expect(text).toContain(`STUDENT ANSWER (typed; any workings written here are assessable):\n${ANSWER}\n`);
    expect(text).toContain("FACT — hasImageAttachment: false");
    expect(text).not.toMatch(/safest calibration target|generous examiner|around 6\/10|around 9\/10|what would this get/i);
    expect(buildAssessmentInstructions(true)).not.toContain("ONLY when the question explicitly instructs");
  });
});
