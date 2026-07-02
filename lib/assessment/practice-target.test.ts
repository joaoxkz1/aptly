import { describe, expect, it } from "vitest";
import type {
  Assessment,
  AssessmentFramework,
  AssessmentMarkBreakdownItem,
  Attempt,
  Feedback,
  MarkBreakdownLabel,
  SyllabusTopic,
} from "@/lib/types";
import {
  GENERATED_PRACTICE_FRAMEWORKS,
  derivePracticeTarget,
  isGeneratedPracticeFramework,
} from "./practice-target";
import { policyForGeneratedPractice } from "./policy";
import { buildLearningInsights } from "./readiness";
import { nextFocusPresentation } from "./display";

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

let seq = 0;

/** A fully marked, core-eligible Economics attempt losing marks on `lostOn`. */
function markedAttempt(o: {
  topic: SyllabusTopic;
  lostOn: MarkBreakdownLabel;
  framework?: AssessmentFramework;
  total?: number;
  earned?: number;
}): Attempt {
  seq += 1;
  const total = o.total ?? 10;
  const earned = o.earned ?? 6;
  const breakdown: AssessmentMarkBreakdownItem[] = [
    { label: o.lostOn, awarded: 1, available: 4, reason: "gap" },
    { label: "Knowledge and terminology", awarded: 3, available: 3, reason: "fine" },
  ];
  const assessment: Assessment = {
    version: 2,
    assessmentFormat: "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis"],
    commandTerm: "explain",
    commandTermLabel: "Explain",
    syllabusUnit: "unit_2",
    syllabusTopic: o.topic,
    topicLabel: "Topic",
    classificationConfidence: "high",
    markingConfidence: "high",
    marksAvailable: total,
    marksAssessable: total,
    marksEarned: earned,
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
    markBreakdown: breakdown,
    limitations: [],
    scoringState: "marked",
    markTotalSource: "explicit",
    recognizedTemplate: null,
    diagramAssessable: false,
    writtenMarksAwarded: earned,
    diagramMarksUnavailable: null,
    capReason: null,
    eligibleForCoreAnalytics: true,
    framework: o.framework ?? "generic_practice",
  };
  return {
    id: `t-${seq}`,
    createdAt: `2026-06-0${(seq % 8) + 1}T10:00:00.000Z`,
    subject: "Economics",
    topic: "Economics",
    question: `Explain something. [${total} marks]`,
    answer: "An answer.",
    feedback: feedback(),
    assessment,
  };
}

/** Two topics so the canonical next focus can name a topic-specific priority. */
function evidenceFor(lostOn: MarkBreakdownLabel, framework?: AssessmentFramework): Attempt[] {
  return [
    markedAttempt({ topic: "2.6", lostOn, framework }),
    markedAttempt({ topic: "2.4", lostOn: "Knowledge and terminology", framework }),
  ];
}

describe("derivePracticeTarget — server-side, evidence-gated", () => {
  it("returns null with no attempts (honest guidance instead of a button)", () => {
    expect(derivePracticeTarget([])).toBeNull();
  });

  it("returns null when there is no canonical next focus (single topic)", () => {
    const attempts = [markedAttempt({ topic: "2.6", lostOn: "Evaluation and judgment" })];
    expect(derivePracticeTarget(attempts)).toBeNull();
  });

  it("targets the canonical next-focus topic and skill", () => {
    const target = derivePracticeTarget(evidenceFor("Evaluation and judgment"));
    expect(target).not.toBeNull();
    expect(target!.topicCode).toBe("2.6");
    expect(target!.focusSkillLabel).toBe("Evaluation and judgment");
    expect(target!.why).toContain("marked answer");
  });

  it("with ONE independent marked answer, the why uses honest early-focus wording", () => {
    const attempts = evidenceFor("Evaluation and judgment"); // 1 answer backs the focus
    const target = derivePracticeTarget(attempts)!;
    expect(target.why).toContain("Early focus to test");
    expect(target.why).toContain("Based on 1 marked answer so far.");
    expect(target.why.toLowerCase()).not.toContain("losing the most marks");
    expect(target.why.toLowerCase()).not.toContain("weakest");
  });

  it("with TWO OR MORE independent marked answers, the stronger why wording returns", () => {
    const attempts = [
      markedAttempt({ topic: "2.6", lostOn: "Evaluation and judgment" }),
      markedAttempt({ topic: "2.6", lostOn: "Evaluation and judgment" }),
      markedAttempt({ topic: "2.4", lostOn: "Knowledge and terminology" }),
    ];
    const target = derivePracticeTarget(attempts)!;
    expect(target.why).toContain("Your next focus is Evaluation and judgment");
    expect(target.why).toContain("across 2 marked answers");
    expect(target.why).toContain("losing the most marks");
    expect(target.why).not.toContain("Early focus to test");
  });

  it("the practice why stays consistent with the Dashboard/Analytics wording helper", () => {
    // Early focus: the why must lead with the exact shared heading.
    const early = evidenceFor("Evaluation and judgment");
    const earlyFocus = buildLearningInsights(early).nextFocus!;
    const earlyCopy = nextFocusPresentation(earlyFocus);
    expect(earlyCopy.early).toBe(true);
    expect(derivePracticeTarget(early)!.why.startsWith(earlyCopy.heading)).toBe(true);
    expect(derivePracticeTarget(early)!.why).toContain(earlyCopy.evidenceLine!);

    // Strong focus: both surfaces agree it is no longer "early".
    const strong = [
      markedAttempt({ topic: "2.6", lostOn: "Evaluation and judgment" }),
      markedAttempt({ topic: "2.6", lostOn: "Evaluation and judgment" }),
      markedAttempt({ topic: "2.4", lostOn: "Knowledge and terminology" }),
    ];
    const strongFocus = buildLearningInsights(strong).nextFocus!;
    expect(nextFocusPresentation(strongFocus).early).toBe(false);
    expect(nextFocusPresentation(strongFocus).heading).toContain("Weakest skill");
    expect(derivePracticeTarget(strong)!.why).toContain("losing the most marks");
  });

  it("maps knowledge gaps to a 2-mark short analytic definition task", () => {
    const target = derivePracticeTarget(evidenceFor("Economic analysis"));
    // Reverse the fixture: make Knowledge the big loss instead.
    const t2 = derivePracticeTarget(evidenceFor("Knowledge and terminology"));
    expect(t2!.framework).toBe("paper2_short_analytic");
    expect(t2!.markTotal).toBe(2);
    expect(t2!.skill).toBe("definition");
    expect(target!.markTotal).toBe(10);
  });

  it("stays generic for essays unless the student has that paper's evidence", () => {
    const generic = derivePracticeTarget(evidenceFor("Evaluation and judgment"));
    expect(generic!.framework).toBe("generic_practice");
    expect(generic!.markTotal).toBe(15);

    const paper = derivePracticeTarget(evidenceFor("Evaluation and judgment", "paper1b_15_mark"));
    expect(paper!.framework).toBe("paper1b_15_mark");
    expect(paper!.markTotal).toBe(15);
  });

  it("uses Paper 1(a) for 10-mark practice only with Paper 1(a) evidence", () => {
    const generic = derivePracticeTarget(evidenceFor("Economic analysis"));
    expect(generic!.framework).toBe("generic_practice");
    expect(generic!.markTotal).toBe(10);

    const paper = derivePracticeTarget(evidenceFor("Economic analysis", "paper1a_10_mark"));
    expect(paper!.framework).toBe("paper1a_10_mark");
  });

  it("maps data use to Paper 2(g) WITH a required generated source", () => {
    const target = derivePracticeTarget(evidenceFor("Data use"));
    expect(target!.framework).toBe("paper2g_15_mark");
    expect(target!.markTotal).toBe(15);
    expect(target!.requiresSource).toBe(true);
    expect(target!.skill).toBe("data_interpretation");
  });

  it("maps policy recommendation to Paper 3(b) WITH a required generated source", () => {
    const target = derivePracticeTarget(evidenceFor("Policy recommendation"));
    expect(target!.framework).toBe("paper3b_10_mark");
    expect(target!.markTotal).toBe(10);
    expect(target!.requiresSource).toBe(true);
    expect(target!.skill).toBe("policy_recommendation");
  });

  it("never targets the 4-mark diagram template or any unsupported framework", () => {
    for (const lostOn of [
      "Knowledge and terminology",
      "Economic analysis",
      "Application to context",
      "Evaluation and judgment",
      "Data use",
      "Calculation method",
      "Final answer",
      "Policy recommendation",
      "Structure and clarity",
    ] as MarkBreakdownLabel[]) {
      const target = derivePracticeTarget(evidenceFor(lostOn));
      expect(target).not.toBeNull();
      expect(GENERATED_PRACTICE_FRAMEWORKS).toContain(target!.framework);
      expect(target!.framework).not.toBe("paper2_four_mark_diagram_explain");
    }
  });

  it("a 'Diagram' breakdown row can never become the focus (excluded upstream)", () => {
    const attempts = [
      markedAttempt({ topic: "2.6", lostOn: "Diagram" }),
      markedAttempt({ topic: "2.4", lostOn: "Diagram" }),
    ];
    const target = derivePracticeTarget(attempts);
    // The only real losses are diagram rows, which are excluded from
    // diagnostics — the remaining signal is Knowledge (fully earned → no
    // focus) so no target exists at all.
    expect(target).toBeNull();
  });
});

describe("policyForGeneratedPractice — grading frame for stored practice rows", () => {
  it("builds a marked, fully assessable policy for a supported framework", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper1a_10_mark",
      markTotal: 10,
      sourceMaterial: null,
    });
    expect(policy.scoringState).toBe("marked");
    expect(policy.total).toBe(10);
    expect(policy.assessable).toBe(10);
    expect(policy.framework).toBe("paper1a_10_mark");
    expect(policy.cappedDiagramMarks).toBe(0);
    expect(policy.recognizedTemplate).toBeNull();
  });

  it("confirms the stored generated source for Paper 2(g)", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper2g_15_mark",
      markTotal: 15,
      sourceMaterial:
        "In 2024 the fictional economy of Arland raised fuel taxes by 12%, cutting consumption 5% while revenue rose to $2.1bn.",
    });
    expect(policy.scoringState).toBe("marked");
    expect(policy.sourceMaterialProvided).toBe(true);
    expect(policy.bestFit).toBe(true);
  });

  it("degrades to feedback-only if a source framework somehow lacks its source", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper2g_15_mark",
      markTotal: 15,
      sourceMaterial: null,
    });
    expect(policy.scoringState).toBe("feedback_only");
    expect(policy.sourceMaterialProvided).toBe(false);
  });

  it("throws (fails closed) on unsupported frameworks and invalid totals", () => {
    expect(() =>
      policyForGeneratedPractice({
        framework: "paper2_four_mark_diagram_explain",
        markTotal: 4,
        sourceMaterial: null,
      })
    ).toThrow();
    expect(() =>
      policyForGeneratedPractice({ framework: "made_up", markTotal: 10, sourceMaterial: null })
    ).toThrow();
    expect(() =>
      policyForGeneratedPractice({ framework: "generic_practice", markTotal: 0, sourceMaterial: null })
    ).toThrow();
    expect(() =>
      policyForGeneratedPractice({ framework: "generic_practice", markTotal: 99, sourceMaterial: null })
    ).toThrow();
  });

  it("isGeneratedPracticeFramework accepts exactly the supported set", () => {
    for (const f of GENERATED_PRACTICE_FRAMEWORKS) {
      expect(isGeneratedPracticeFramework(f)).toBe(true);
    }
    expect(isGeneratedPracticeFramework("paper2_four_mark_diagram_explain")).toBe(false);
    expect(isGeneratedPracticeFramework(null)).toBe(false);
  });
});
