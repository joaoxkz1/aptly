import { describe, it, expect } from "vitest";
import type { Assessment, Attempt } from "@/lib/types";
import { deriveScoringState, isCoreEligible, markPresentation } from "./status";

const BASE: Assessment = {
  version: 2,
  assessmentFormat: "custom_short_response",
  paper: "custom",
  questionPart: "unknown",
  levelRelevance: "shared_sl_hl",
  assessmentSkills: ["economic_analysis"],
  commandTerm: "explain",
  commandTermLabel: "Explain",
  syllabusUnit: "unit_2",
  syllabusTopic: "2.1",
  topicLabel: "Demand",
  classificationConfidence: "high",
  markingConfidence: "high",
  marksAvailable: 15,
  marksAssessable: 15,
  marksEarned: 10,
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
  markBreakdown: [{ label: "Economic analysis", awarded: 10, available: 15, reason: "ok" }],
  limitations: [],
  scoringState: "marked",
  markTotalSource: "explicit",
  recognizedTemplate: null,
  diagramAssessable: false,
  writtenMarksAwarded: 10,
  diagramMarksUnavailable: null,
  capReason: null,
  eligibleForCoreAnalytics: true,
};

function attempt(assessment: Assessment | null): Attempt {
  return {
    id: "t1",
    createdAt: new Date().toISOString(),
    subject: "Economics",
    topic: "Demand",
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

/** Build a legacy (pre-v2) assessment: none of the v2 fields exist. */
function legacy(overrides: Partial<Assessment>): Assessment {
  return {
    ...BASE,
    scoringState: undefined,
    markTotalSource: undefined,
    recognizedTemplate: undefined,
    diagramAssessable: undefined,
    writtenMarksAwarded: undefined,
    diagramMarksUnavailable: undefined,
    capReason: undefined,
    eligibleForCoreAnalytics: undefined,
    ...overrides,
  };
}

describe("deriveScoringState — new (v2) attempts trust the server state", () => {
  it("marked", () => {
    expect(deriveScoringState(attempt({ ...BASE, scoringState: "marked" }))).toBe("marked");
  });
  it("provisional", () => {
    expect(
      deriveScoringState(attempt({ ...BASE, scoringState: "provisional", markTotalSource: "template_inferred" }))
    ).toBe("provisional");
  });
  it("feedback_only", () => {
    expect(
      deriveScoringState(
        attempt({
          ...BASE,
          scoringState: "feedback_only",
          markDisplayMode: "practice_feedback_only",
          marksAvailable: null,
          marksAssessable: null,
          marksEarned: null,
          markBreakdown: [],
        })
      )
    ).toBe("feedback_only");
  });
  it("no assessment => legacy_unscored", () => {
    expect(deriveScoringState(attempt(null))).toBe("legacy_unscored");
  });
});

describe("isCoreEligible", () => {
  it("a marked attempt stays core-eligible even when the diagnostic breakdown does NOT sum to the mark", () => {
    // Best-fit mark is 12/15 but the diagnostic breakdown is a separate scale.
    const decoupled = attempt({
      ...BASE,
      scoringState: "marked",
      marksEarned: 12,
      marksAssessable: 15,
      marksAvailable: 15,
      markBreakdown: [{ label: "Economic analysis", awarded: 3, available: 5, reason: "diagnostic" }],
    });
    expect(deriveScoringState(decoupled)).toBe("marked");
    expect(isCoreEligible(decoupled)).toBe(true);
  });

  it("only marked v2 attempts feed core", () => {
    expect(isCoreEligible(attempt({ ...BASE, scoringState: "marked" }))).toBe(true);
    expect(
      isCoreEligible(attempt({ ...BASE, scoringState: "provisional", eligibleForCoreAnalytics: false }))
    ).toBe(false);
    expect(
      isCoreEligible(
        attempt({ ...BASE, scoringState: "feedback_only", eligibleForCoreAnalytics: false, marksEarned: null, marksAssessable: null, markBreakdown: [] })
      )
    ).toBe(false);
  });
});

describe("legacy attempts — conservative, grandfathered (no reinterpretation)", () => {
  it("legacy exact_estimate stays marked AND core (unchanged from before)", () => {
    const a = legacy({ markDisplayMode: "exact_estimate", marksSource: "explicit_in_question" });
    expect(deriveScoringState(attempt(a))).toBe("marked");
    expect(isCoreEligible(attempt(a))).toBe(true);
  });

  it("legacy practice_feedback_only => feedback_only, not core", () => {
    const a = legacy({
      markDisplayMode: "practice_feedback_only",
      marksAvailable: null,
      marksAssessable: null,
      marksEarned: null,
      markBreakdown: [],
    });
    expect(deriveScoringState(attempt(a))).toBe("feedback_only");
    expect(isCoreEligible(attempt(a))).toBe(false);
  });

  it("legacy partial_estimate displays a mark but is NOT silently upgraded into core", () => {
    const a = legacy({
      markDisplayMode: "partial_estimate",
      marksAvailable: 4,
      marksAssessable: 2,
      marksEarned: 2,
      markBreakdown: [{ label: "Economic analysis", awarded: 2, available: 2, reason: "written" }],
    });
    expect(deriveScoringState(attempt(a))).toBe("marked");
    expect(isCoreEligible(attempt(a))).toBe(false); // grandfathered exclusion
  });
});

describe("markPresentation — canonical display, earned / total", () => {
  it("marked shows earned / available", () => {
    const p = markPresentation(attempt({ ...BASE, marksEarned: 12, marksAvailable: 15, marksAssessable: 15 }));
    expect(p.tone).toBe("marked");
    expect(p.fraction).toBe("12 / 15");
  });

  it("capped marked shows the full total denominator", () => {
    const p = markPresentation(
      attempt({
        ...BASE,
        marksAvailable: 4,
        marksAssessable: 2,
        marksEarned: 2,
        markDisplayMode: "partial_estimate",
        capReason: "Diagram evidence missing.",
        markBreakdown: [{ label: "Economic analysis", awarded: 2, available: 2, reason: "written" }],
      })
    );
    expect(p.fraction).toBe("2 / 4");
    expect(p.reason).toBeTruthy();
  });

  it("provisional shows the muted purple tone and a 'Likely' framing", () => {
    const p = markPresentation(
      attempt({
        ...BASE,
        scoringState: "provisional",
        markTotalSource: "template_inferred",
        markDisplayMode: "provisional_estimate",
        marksAvailable: 4,
        marksAssessable: 2,
        marksEarned: 2,
        recognizedTemplate: "four_mark_diagram_explain",
      })
    );
    expect(p.tone).toBe("provisional");
    expect(p.fraction).toBe("2 / 4");
  });

  it("feedback-only shows no fraction", () => {
    const p = markPresentation(
      attempt({
        ...BASE,
        scoringState: "feedback_only",
        markDisplayMode: "practice_feedback_only",
        marksAvailable: null,
        marksAssessable: null,
        marksEarned: null,
        markBreakdown: [],
      })
    );
    expect(p.tone).toBe("feedback");
    expect(p.fraction).toBeNull();
  });

  it("legacy without assessment shows no fraction", () => {
    const p = markPresentation(attempt(null));
    expect(p.tone).toBe("legacy");
    expect(p.fraction).toBeNull();
  });
});
