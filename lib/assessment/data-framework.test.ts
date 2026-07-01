import { describe, it, expect } from "vitest";
import type {
  Assessment,
  AssessmentFramework,
  AssessmentMarkBreakdownItem,
  Attempt,
  SyllabusTopic,
} from "@/lib/types";
import { resolveScoringPolicy, type PreflightChoice } from "./policy";
import {
  deriveScoringState,
  isCoreEligible,
  markPresentation,
  stripUnassessableDiagramMistake,
} from "./status";
import {
  frameworkFormatLabel,
  frameworkMeta,
  frameworkShortLabel,
  visibleDiagnosticRows,
} from "./display";
import { buildLearningInsights } from "./readiness";

function choice(overrides: Partial<PreflightChoice> = {}): PreflightChoice {
  return {
    requestedSource: null,
    requestedTotal: null,
    templateId: null,
    requestedFramework: null,
    sourceMaterial: null,
    ...overrides,
  };
}

const SOURCE = "Extract: in 2023 country X raised tariffs by 20% and imports fell 8% year on year.";

function assess(o: {
  framework: AssessmentFramework;
  total: number | null;
  earned: number | null;
  scoringState?: Assessment["scoringState"];
  eligibleForCoreAnalytics?: boolean;
  sourceMaterialProvided?: boolean;
  syllabusTopic?: SyllabusTopic;
  breakdown?: AssessmentMarkBreakdownItem[];
}): Assessment {
  const marked = o.total != null && o.earned != null;
  return {
    version: 2,
    assessmentFormat: "custom_extended_response",
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
    unassessedMarks: marked ? 0 : null,
    marksSource: marked ? "explicit_in_question" : "not_reliably_known",
    markDisplayMode: marked ? "exact_estimate" : "practice_feedback_only",
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
    markBreakdown: o.breakdown ?? (marked ? [{ label: "Economic analysis", awarded: o.earned!, available: o.total!, reason: "x" }] : []),
    limitations: [],
    scoringState: o.scoringState ?? (marked ? "marked" : "feedback_only"),
    markTotalSource: marked ? "explicit" : "unknown",
    recognizedTemplate: null,
    diagramAssessable: false,
    writtenMarksAwarded: o.earned,
    diagramMarksUnavailable: null,
    capReason: null,
    eligibleForCoreAnalytics: o.eligibleForCoreAnalytics ?? marked,
    framework: o.framework,
    sourceMaterialProvided: o.sourceMaterialProvided,
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

// --- A: source-material requirement ---------------------------------------

describe("A — Paper 2(g)/3(b) without source material → feedback-only", () => {
  it("E1: explicit Paper 2(g), no source → feedback-only, no mark, no band", () => {
    const p = resolveScoringPolicy("Paper 2(g): using the text provided, discuss tariffs. [15 marks]", choice());
    expect(p.scoringState).toBe("feedback_only");
    expect(p.framework).toBe("paper2g_15_mark");
    expect(p.total).toBeNull();
    expect(p.assessable).toBeNull();
    expect(p.sourceMaterialProvided).toBe(false);
    // Rendered: no fraction / no band-bearing mark.
    const a = assess({ framework: "paper2g_15_mark", total: null, earned: null, sourceMaterialProvided: false });
    expect(markPresentation(attempt(a)).fraction).toBeNull();
    expect(deriveScoringState(attempt(a))).toBe("feedback_only");
  });

  it("E2: explicit Paper 3(b), no source → feedback-only, no mark, no band", () => {
    const p = resolveScoringPolicy("Paper 3(b): recommend a policy using the data. [10 marks]", choice());
    expect(p.scoringState).toBe("feedback_only");
    expect(p.framework).toBe("paper3b_10_mark");
    expect(p.total).toBeNull();
    expect(p.sourceMaterialProvided).toBe(false);
  });

  it("E3: Paper 2(g)/3(b) WITH source → proper framework treatment", () => {
    const g = resolveScoringPolicy("Paper 2(g): discuss the extract. [15 marks]", choice({ sourceMaterial: SOURCE }));
    expect(g.scoringState).toBe("marked");
    expect(g.framework).toBe("paper2g_15_mark");
    expect(g.total).toBe(15);
    expect(g.assessable).toBe(15);
    expect(g.bestFit).toBe(true);
    expect(g.sourceMaterialProvided).toBe(true);

    const b = resolveScoringPolicy("Paper 3(b): recommend using the data. [10 marks]", choice({ sourceMaterial: SOURCE }));
    expect(b.scoringState).toBe("marked");
    expect(b.framework).toBe("paper3b_10_mark");
    expect(b.total).toBe(10);
    expect(b.sourceMaterialProvided).toBe(true);
  });

  it("rejects a too-short source paste as unusable → still feedback-only", () => {
    const p = resolveScoringPolicy("Paper 2(g): discuss. [15 marks]", choice({ sourceMaterial: "see chart" }));
    expect(p.scoringState).toBe("feedback_only");
  });
});

describe("A — missing-source attempts excluded from core analytics", () => {
  it("E4: a new source-less Paper 2(g) attempt is not core-eligible", () => {
    const a = attempt(assess({ framework: "paper2g_15_mark", total: null, earned: null, sourceMaterialProvided: false }));
    expect(isCoreEligible(a)).toBe(false);
    expect(buildLearningInsights([a]).validCount).toBe(0);
  });

  it("E8: a pre-patch Paper 3(b) marked attempt with NO stored source flag → conservative feedback-only, excluded", () => {
    // Simulate a current-version attempt saved before this patch: marked, but
    // sourceMaterialProvided is absent.
    const a = attempt(
      assess({
        framework: "paper3b_10_mark",
        total: 10,
        earned: 7,
        scoringState: "marked",
        eligibleForCoreAnalytics: true,
        sourceMaterialProvided: undefined,
      })
    );
    expect(deriveScoringState(a)).toBe("feedback_only");
    expect(isCoreEligible(a)).toBe(false);
    expect(buildLearningInsights([a]).validCount).toBe(0);
  });

  it("a source-PROVIDED marked Paper 2(g) stays core-eligible", () => {
    const a = attempt(
      assess({ framework: "paper2g_15_mark", total: 15, earned: 12, sourceMaterialProvided: true })
    );
    expect(deriveScoringState(a)).toBe("marked");
    expect(isCoreEligible(a)).toBe(true);
  });
});

// --- B: missing diagram is never a skill weakness --------------------------

describe("B — missing diagram never becomes a diagnosed weakness", () => {
  const attempts = [
    attempt(
      assess({
        framework: "paper1b_15_mark",
        total: 15,
        earned: 9,
        syllabusTopic: "2.6",
        breakdown: [
          { label: "Diagram", awarded: 0, available: 2, reason: "no diagram" },
          { label: "Evaluation and judgment", awarded: 1, available: 5, reason: "thin" },
          { label: "Economic analysis", awarded: 4, available: 5, reason: "ok" },
        ],
      }),
      "a1"
    ),
    attempt(
      assess({
        framework: "paper1b_15_mark",
        total: 15,
        earned: 8,
        syllabusTopic: "2.1",
        breakdown: [
          { label: "Diagram", awarded: 0, available: 2, reason: "no diagram" },
          { label: "Evaluation and judgment", awarded: 2, available: 5, reason: "needs judgement" },
        ],
      }),
      "a2"
    ),
  ];
  const insights = buildLearningInsights(attempts);

  it("E5: Diagram never appears in diagnostic-signal ranking or next-focus", () => {
    expect(insights.skillPriority.some((s) => s.label === "Diagram")).toBe(false);
    expect(insights.nextFocus).not.toBeNull();
    expect(insights.nextFocus!.skillLabel).not.toBe("Diagram");
  });

  it("E5: missing-diagram mistake is stripped from recurring patterns", () => {
    expect(
      stripUnassessableDiagramMistake(
        ["Missing diagram explanation", "Lack of evaluation"],
        true,
        false
      )
    ).toEqual(["Lack of evaluation"]);
    // A submitted diagram (future release) keeps the mistake.
    expect(stripUnassessableDiagramMistake(["Missing diagram explanation"], true, true)).toEqual([
      "Missing diagram explanation",
    ]);
  });

  it("E7: the qualitative diagnostic rows never include Diagram", () => {
    const rows = visibleDiagnosticRows([
      { label: "Diagram", awarded: 0, available: 2, reason: "no diagram" },
      { label: "Economic analysis", awarded: 3, available: 5, reason: "ok" },
    ]);
    expect(rows.some((r) => r.label === "Diagram")).toBe(false);
    expect(rows).toHaveLength(1);
  });
});

// --- C: four-mark diagram label + component polish -------------------------

describe("C — four-mark diagram framework labels", () => {
  const a = assess({ framework: "paper2_four_mark_diagram_explain", total: 4, earned: 2 });

  it("E6: renders '4-mark diagram explanation', never 'Paper 2'", () => {
    for (const label of [frameworkMeta(a).label, frameworkShortLabel(a), frameworkFormatLabel(a)]) {
      expect(label).toBe("4-mark diagram explanation");
      expect(label).not.toContain("Paper 2");
    }
  });
});
