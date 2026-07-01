import { describe, it, expect } from "vitest";
import type {
  Assessment,
  AssessmentFramework,
  AssessmentMarkBreakdownItem,
  Attempt,
  SyllabusTopic,
} from "@/lib/types";
import {
  diagnosticSignalStrength,
  diagramEvidenceNote,
  frameworkFormatLabel,
  frameworkShortLabel,
} from "./display";
import { buildLearningInsights, performanceByFormat } from "./readiness";

function markedAssessment(o: {
  framework: AssessmentFramework;
  total: number;
  earned: number;
  assessmentFormat?: Assessment["assessmentFormat"];
  syllabusTopic?: SyllabusTopic;
  breakdown?: AssessmentMarkBreakdownItem[];
}): Assessment {
  return {
    version: 2,
    assessmentFormat: o.assessmentFormat ?? "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis"],
    commandTerm: "discuss",
    commandTermLabel: "Discuss",
    syllabusUnit: "unit_2",
    syllabusTopic: o.syllabusTopic ?? "2.6",
    topicLabel: "Market failure",
    classificationConfidence: "high",
    markingConfidence: "high",
    marksAvailable: o.total,
    marksAssessable: o.total,
    marksEarned: o.earned,
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
    markBreakdown: o.breakdown ?? [
      { label: "Economic analysis", awarded: o.earned, available: o.total, reason: "x" },
    ],
    limitations: [],
    scoringState: "marked",
    markTotalSource: "explicit",
    recognizedTemplate: null,
    diagramAssessable: false,
    writtenMarksAwarded: o.earned,
    diagramMarksUnavailable: null,
    capReason: null,
    eligibleForCoreAnalytics: true,
    framework: o.framework,
  };
}

function attempt(assessment: Assessment, id = "t1"): Attempt {
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

const FORBIDDEN = ["available marks", "marks lost", "% of available"];
const RATIO = /\d+\s*\/\s*\d+/; // e.g. "3/6"

describe("B — framework-sourced labels never leak a model paper label", () => {
  it("generic 15-mark (model classified paper_1_b) renders '15-mark practice response'", () => {
    const a = markedAssessment({ framework: "generic_practice", total: 15, earned: 12, assessmentFormat: "paper_1_b" });
    const label = frameworkShortLabel(a);
    expect(label).toBe("15-mark practice response");
    expect(label).not.toContain("Paper 1(b)");
  });

  it("generic 10-mark (model classified paper_1_a) renders '10-mark practice response'", () => {
    const a = markedAssessment({ framework: "generic_practice", total: 10, earned: 6, assessmentFormat: "paper_1_a" });
    const label = frameworkShortLabel(a);
    expect(label).toBe("10-mark practice response");
    expect(label).not.toContain("Paper 1(a)");
  });

  it("confirmed paper frameworks still render their paper label", () => {
    expect(frameworkShortLabel(markedAssessment({ framework: "paper1b_15_mark", total: 15, earned: 13 }))).toBe(
      "Paper 1(b) · 15-mark extended response"
    );
  });

  it("performance-by-format groups generic under a practice label, not a paper label", () => {
    const rows = performanceByFormat([
      attempt(markedAssessment({ framework: "generic_practice", total: 15, earned: 12, assessmentFormat: "paper_1_b" })),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("15-mark practice");
    expect(rows[0].label).not.toContain("Paper 1(b)");
  });

  it("frameworkFormatLabel maps confirmed papers and generic totals", () => {
    expect(frameworkFormatLabel(markedAssessment({ framework: "paper1a_10_mark", total: 10, earned: 7 }))).toBe("Paper 1(a)");
    expect(frameworkFormatLabel(markedAssessment({ framework: "generic_practice", total: 10, earned: 7 }))).toBe("10-mark practice");
  });
});

describe("A — next-focus copy never presents diagnostics as marks", () => {
  const attempts = [
    attempt(
      markedAssessment({
        framework: "paper1b_15_mark",
        total: 15,
        earned: 9,
        syllabusTopic: "2.6",
        breakdown: [
          { label: "Evaluation and judgment", awarded: 1, available: 5, reason: "thin evaluation" },
          { label: "Economic analysis", awarded: 4, available: 5, reason: "solid analysis" },
        ],
      }),
      "a1"
    ),
    attempt(
      markedAssessment({
        framework: "paper1b_15_mark",
        total: 15,
        earned: 10,
        syllabusTopic: "2.6",
        breakdown: [
          { label: "Evaluation and judgment", awarded: 2, available: 5, reason: "needs judgement" },
          { label: "Economic analysis", awarded: 5, available: 5, reason: "strong analysis" },
        ],
      }),
      "a2"
    ),
    attempt(
      markedAssessment({
        framework: "paper1a_10_mark",
        total: 10,
        earned: 4,
        syllabusTopic: "2.1",
        breakdown: [{ label: "Evaluation and judgment", awarded: 2, available: 4, reason: "early signal" }],
      }),
      "a3"
    ),
  ];

  const insights = buildLearningInsights(attempts);

  it("produces a next-focus with no marks/percentages/ratios", () => {
    const nf = insights.nextFocus;
    expect(nf).not.toBeNull();
    const texts = [nf!.explanation, nf!.whyThis ?? ""];
    for (const t of texts) {
      for (const bad of FORBIDDEN) expect(t.toLowerCase()).not.toContain(bad);
      expect(t).not.toMatch(RATIO);
      expect(t).not.toContain("%");
    }
    expect(nf!.explanation).toContain("diagnostic improvement signal");
  });

  it("skill priority rows carry a marked-answer evidence count", () => {
    const evaluation = insights.skillPriority.find((s) => s.label === "Evaluation and judgment");
    expect(evaluation?.responses).toBe(3);
  });
});

describe("A — diagnostic signal thresholds", () => {
  it("maps percentLost to qualitative signal strength", () => {
    expect(diagnosticSignalStrength(80)).toBe("Strong signal");
    expect(diagnosticSignalStrength(50)).toBe("Strong signal");
    expect(diagnosticSignalStrength(49)).toBe("Developing signal");
    expect(diagnosticSignalStrength(25)).toBe("Developing signal");
    expect(diagnosticSignalStrength(24)).toBe("Limited signal");
    expect(diagnosticSignalStrength(1)).toBe("Limited signal");
  });
});

describe("C — diagram evidence wording", () => {
  it("says 'diagram evidence', never 'diagram marks'", () => {
    const note = diagramEvidenceNote(1);
    const combined = `${note.title} ${note.body}`.toLowerCase();
    expect(combined).toContain("diagram evidence");
    expect(combined).not.toContain("diagram marks");
    expect(note.body).toContain("no diagram itself has been assessed");
  });
});
