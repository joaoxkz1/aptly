import { describe, it, expect } from "vitest";
import type { Assessment, Attempt, Feedback } from "@/lib/types";
import { runPreflight } from "./preflight";
import {
  filterSourceDataFeedback,
  isSourceMaterialMissing,
  requiresSourceMaterial,
} from "./status";
import { stateBreakdown } from "./readiness";

const BASE: Assessment = {
  version: 2,
  assessmentFormat: "custom_extended_response",
  paper: "custom",
  questionPart: "unknown",
  levelRelevance: "shared_sl_hl",
  assessmentSkills: ["economic_analysis"],
  commandTerm: "discuss",
  commandTermLabel: "Discuss",
  syllabusUnit: "unit_2",
  syllabusTopic: "2.6",
  topicLabel: "Market failure",
  classificationConfidence: "high",
  markingConfidence: "high",
  marksAvailable: 15,
  marksAssessable: 15,
  marksEarned: 11,
  unassessedMarks: 0,
  marksSource: "explicit_in_question",
  markDisplayMode: "exact_estimate",
  evidenceSplitSource: "not_specified",
  unassessedEvidence: null,
  practiceLevelLow: 4,
  practiceLevelHigh: 5,
  practiceLevelConfidence: "medium",
  diagramExpected: false,
  diagramSubmitted: false,
  diagramAssessmentStatus: "not_relevant",
  workingsExpected: false,
  workingsSubmitted: false,
  workingsAssessmentStatus: "not_relevant",
  attachmentContent: "none",
  markBreakdown: [{ label: "Economic analysis", awarded: 11, available: 15, reason: "x" }],
  limitations: [],
  scoringState: "marked",
  markTotalSource: "explicit",
  recognizedTemplate: null,
  diagramAssessable: false,
  writtenMarksAwarded: 11,
  diagramMarksUnavailable: null,
  capReason: null,
  eligibleForCoreAnalytics: true,
  framework: "paper1b_15_mark",
  sourceMaterialProvided: undefined,
};

function mk(overrides: Partial<Assessment> = {}): Assessment {
  return { ...BASE, ...overrides };
}

function attempt(assessment: Assessment | null, id = "t"): Attempt {
  return {
    id,
    createdAt: new Date().toISOString(),
    subject: "Economics",
    topic: "t",
    question: "Q",
    answer: "A",
    feedback: {
      score: 5,
      band: "Secure 5",
      strengths: [],
      improvements: [],
      mistakes: [],
      examinerComment: "c",
      studyNext: "s",
    },
    assessment,
  };
}

// --- 1. Source-material preflight hides the generic Grade CTA ---------------

describe("source-material preflight CTA gating", () => {
  it("an explicit Paper 2(g) activates the source step (bottom Grade CTA hidden)", () => {
    const pf = runPreflight("Paper 2(g): using the text provided, discuss tariffs. [15 marks]");
    const sourceStepActive = pf.frameworkConfirmed && requiresSourceMaterial(pf.framework);
    expect(sourceStepActive).toBe(true);
  });

  it("a normal question does NOT activate the source step (Grade CTA preserved)", () => {
    const pf = runPreflight("Evaluate the impact of tariffs. [15 marks]");
    const sourceStepActive = pf.frameworkConfirmed && requiresSourceMaterial(pf.framework);
    expect(sourceStepActive).toBe(false);
  });
});

// --- 2/3. Source-data feedback filtering -----------------------------------

describe("source-less data-response feedback never criticises unprovided data", () => {
  const raw: Feedback = {
    score: 0,
    band: "",
    strengths: ["Clear policy choice and rationale.", "You used the supplied data effectively."],
    improvements: ["Refer to the figures in the extract.", "Add a two-sided evaluation."],
    mistakes: [],
    examinerComment: "Quote the source to support your claims.",
    studyNext: "Refer to the data provided next time.",
  };

  it("strips every data-use corrective item, keeps theory/policy/evaluation", () => {
    const out = filterSourceDataFeedback(raw);
    expect(out.strengths).toEqual(["Clear policy choice and rationale."]);
    expect(out.improvements).toEqual(["Add a two-sided evaluation."]);
    expect(out.examinerComment).toBe("");
    expect(out.studyNext).toBe("");
    const all = [...out.strengths, ...out.improvements, out.examinerComment, out.studyNext]
      .join(" ")
      .toLowerCase();
    for (const bad of ["supplied data", "the figures", "quote the source", "the extract", "data use", "refer to the"]) {
      expect(all).not.toContain(bad);
    }
  });

  it("source-BACKED Paper 2(g) does not trigger the filter (data-use feedback preserved)", () => {
    const backed = mk({ framework: "paper2g_15_mark", sourceMaterialProvided: true });
    const missing = mk({ framework: "paper2g_15_mark", sourceMaterialProvided: undefined });
    expect(isSourceMaterialMissing(backed)).toBe(false);
    expect(isSourceMaterialMissing(missing)).toBe(true);
  });
});

// --- 4. Dashboard weekly counts reconcile ----------------------------------

describe("dashboard weekly state breakdown reconciles (no unexplained mismatch)", () => {
  const attempts = [
    attempt(mk(), "c1"),
    attempt(mk(), "c2"),
    attempt(mk({ framework: "generic_practice", scoringState: "provisional", eligibleForCoreAnalytics: false }), "p1"),
    attempt(
      mk({
        framework: "generic_practice",
        scoringState: "feedback_only",
        eligibleForCoreAnalytics: false,
        marksEarned: null,
        marksAssessable: null,
        marksAvailable: null,
        markBreakdown: [],
      }),
      "f1"
    ),
    attempt(null, "u1"),
  ];

  it("every submission lands in exactly one bucket, summing to the total", () => {
    const b = stateBreakdown(attempts);
    expect(b).toEqual({ total: 5, confirmed: 2, provisional: 1, feedbackOnly: 1, unscored: 1 });
    expect(b.confirmed + b.provisional + b.feedbackOnly + b.unscored).toBe(b.total);
  });

  it("a source-less Paper 2(g) counts as feedback-only, never confirmed", () => {
    const a = attempt(mk({ framework: "paper2g_15_mark", sourceMaterialProvided: undefined }));
    const b = stateBreakdown([a]);
    expect(b.confirmed).toBe(0);
    expect(b.feedbackOnly).toBe(1);
  });
});
