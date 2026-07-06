import { describe, expect, it } from "vitest";
import {
  DIAGRAM_CAP_REASON_WITH_EVIDENCE,
  DIAGRAM_EVIDENCE_LIMITATION,
  DIAGRAM_PRIVACY_DISCLOSURE,
  DIAGRAM_RETAKE_GUIDANCE,
  DIAGRAM_REVIEW_STATUS_LABELS,
  diagramPrivacyDisclosure,
  isDiagramEvidence,
  presentDiagramEvidence,
  type DiagramEvidence,
} from "./evidence";
import {
  markPresentation,
  presentedFeedback,
  presentedLimitations,
} from "@/lib/assessment/status";
import { mentionsAddDiagramAdvice, mentionsUnsubmittedDiagram } from "./evidence";
import type { Assessment, Attempt, Feedback } from "@/lib/types";

/**
 * The shared Diagram Evidence presenter + the display-level reconciliation
 * with the 4-mark template cap. Invariants: an unassessable review presents
 * ZERO findings, every presentation carries the fixed limitation, "unclear"
 * is never worded as missing, and the cap-reason swap changes COPY only —
 * marks, fractions, and scoring state are untouched.
 */

function evidence(overrides: Partial<DiagramEvidence> = {}): DiagramEvidence {
  return {
    version: 1,
    status: "reviewed_clearly",
    graphTypeObserved: "demand and supply",
    relevanceToQuestion: "appears_relevant",
    elements: [
      { element: "axes_labels", observed: "visible" },
      { element: "shift_arrows", observed: "unclear" },
      { element: "welfare_areas", observed: "not_visible" },
    ],
    consistencyWithAnswer: "supports",
    improvements: ["Mark the new equilibrium clearly."],
    ...overrides,
  };
}

describe("the three review states", () => {
  it("carry exactly the required student-facing labels", () => {
    expect(DIAGRAM_REVIEW_STATUS_LABELS).toEqual({
      reviewed_clearly: "Reviewed clearly",
      partially_readable: "Partially readable",
      unable_to_assess: "Unable to assess reliably",
    });
  });
});

describe("presentDiagramEvidence — findings", () => {
  it("presents a clear review with type, relevance, elements, comparison, improvements", () => {
    const p = presentDiagramEvidence(evidence());
    expect(p.statusLabel).toBe("Reviewed clearly");
    expect(p.tone).toBe("clear");
    expect(p.showFindings).toBe(true);
    expect(p.graphTypeLine).toBe("Appears to show: demand and supply");
    expect(p.relevanceLine).toContain("broadly relevant");
    expect(p.elementRows).toHaveLength(3);
    expect(p.consistencyLine).toContain("supports your written explanation");
    expect(p.improvements).toEqual(["Mark the new equilibrium clearly."]);
    expect(p.retakeGuidance).toBeNull();
  });

  it('words observations about the PHOTO — "unclear" and "not visible" are never "missing"', () => {
    const p = presentDiagramEvidence(evidence());
    const labels = p.elementRows.map((r) => r.observationLabel);
    expect(labels).toEqual(["Visible", "Unclear in the photo", "Not visible in the photo"]);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toContain("missing");
    }
  });

  it("omits the graph-type line when unidentified and the comparison when not checked", () => {
    const p = presentDiagramEvidence(
      evidence({ graphTypeObserved: null, consistencyWithAnswer: "not_checked" })
    );
    expect(p.graphTypeLine).toBeNull();
    expect(p.consistencyLine).toBeNull();
  });

  it("caps improvements at two even if stored data carried more", () => {
    const p = presentDiagramEvidence(evidence({ improvements: ["a", "b", "c"] }));
    expect(p.improvements).toEqual(["a", "b"]);
  });
});

describe("presentDiagramEvidence — unable to assess", () => {
  it("presents NO findings, only retake guidance (defensive even against bad stored data)", () => {
    const p = presentDiagramEvidence(evidence({ status: "unable_to_assess" }));
    expect(p.statusLabel).toBe("Unable to assess reliably");
    expect(p.tone).toBe("unassessable");
    expect(p.showFindings).toBe(false);
    expect(p.graphTypeLine).toBeNull();
    expect(p.relevanceLine).toBeNull();
    expect(p.elementRows).toEqual([]);
    expect(p.consistencyLine).toBeNull();
    expect(p.improvements).toEqual([]);
    expect(p.retakeGuidance).toBe(DIAGRAM_RETAKE_GUIDANCE);
  });

  it("retake guidance is practical and never blames the student's work", () => {
    expect(DIAGRAM_RETAKE_GUIDANCE).toContain("closer, brighter photo");
    expect(DIAGRAM_RETAKE_GUIDANCE).toContain("doesn't affect your written feedback");
    expect(DIAGRAM_RETAKE_GUIDANCE.toLowerCase()).not.toContain("missing");
  });
});

describe("the fixed limitation and disclosure copy", () => {
  it("every presentation carries the single limitation statement", () => {
    for (const status of ["reviewed_clearly", "partially_readable", "unable_to_assess"] as const) {
      expect(presentDiagramEvidence(evidence({ status })).limitation).toBe(
        DIAGRAM_EVIDENCE_LIMITATION
      );
    }
  });

  it("the limitation is honest about authority and mark effect", () => {
    expect(DIAGRAM_EVIDENCE_LIMITATION).toContain("approximate");
    expect(DIAGRAM_EVIDENCE_LIMITATION).toContain("not IB marking");
    expect(DIAGRAM_EVIDENCE_LIMITATION).toContain("does not change your mark estimate");
  });

  it("the attachment disclosure is conditional and complete", () => {
    expect(diagramPrivacyDisclosure(true)).toBe(DIAGRAM_PRIVACY_DISCLOSURE);
    expect(diagramPrivacyDisclosure(false)).toBeNull();
    expect(DIAGRAM_PRIVACY_DISCLOSURE).toContain("Aptly does not store the image");
    expect(DIAGRAM_PRIVACY_DISCLOSURE).toContain("never changes your mark estimate");
  });
});

describe("isDiagramEvidence — storage/API guard", () => {
  it("accepts well-formed evidence and rejects junk", () => {
    expect(isDiagramEvidence(evidence())).toBe(true);
    expect(isDiagramEvidence(null)).toBe(false);
    expect(isDiagramEvidence({})).toBe(false);
    expect(isDiagramEvidence(evidence({ status: "perfect" as never }))).toBe(false);
    expect(isDiagramEvidence({ ...evidence(), version: 2 })).toBe(false);
  });
});

// --- Display reconciliation with the 4-mark template cap ----------------------

function feedback(): Feedback {
  return {
    score: 4,
    band: "internal",
    strengths: [],
    improvements: [],
    mistakes: [],
    examinerComment: "",
    studyNext: "",
  };
}

function templateAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
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
    marksAvailable: 4,
    marksAssessable: 2,
    marksEarned: 2,
    unassessedMarks: 2,
    marksSource: "explicit_in_question",
    markDisplayMode: "exact_estimate",
    evidenceSplitSource: "not_specified",
    unassessedEvidence: null,
    practiceLevelLow: 4,
    practiceLevelHigh: 5,
    practiceLevelConfidence: "medium",
    diagramExpected: true,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_submitted",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    markBreakdown: [],
    limitations: [],
    scoringState: "provisional",
    markTotalSource: "template_inferred",
    recognizedTemplate: "four_mark_diagram_explain",
    diagramAssessable: false,
    writtenMarksAwarded: 2,
    diagramMarksUnavailable: 2,
    capReason:
      "Diagram evidence missing. Your explanation earned written marks, but the diagram marks could not be verified.",
    eligibleForCoreAnalytics: false,
    ...overrides,
  };
}

function attemptWith(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "a-1",
    createdAt: "2026-07-01T10:00:00.000Z",
    subject: "Economics",
    topic: "Economics",
    question: "Explain, using a diagram, how a subsidy affects a market. [4]",
    answer: "A subsidy shifts supply right…",
    feedback: feedback(),
    assessment: templateAssessment(),
    ...overrides,
  };
}

describe("markPresentation — cap-reason reconciliation (display copy only)", () => {
  it("without diagram evidence, the stored template cap reason is unchanged", () => {
    const p = markPresentation(attemptWith());
    expect(p.reason).toContain("Diagram evidence missing");
    expect(p.fraction).toBe("2 / 4");
    expect(p.state).toBe("provisional");
  });

  it("with reviewed diagram evidence, the copy reconciles — marks and state do NOT change", () => {
    const withEvidence = attemptWith({ diagramEvidence: evidence() });
    const p = markPresentation(withEvidence);
    expect(p.reason).toBe(DIAGRAM_CAP_REASON_WITH_EVIDENCE);
    expect(p.reason).not.toContain("missing");
    // The cap itself is untouched: same fraction, same state, same tone.
    expect(p.fraction).toBe("2 / 4");
    expect(p.state).toBe("provisional");
    expect(p.tone).toBe("provisional");
  });

  it("the reconciled copy still says marks are excluded — never awarded", () => {
    expect(DIAGRAM_CAP_REASON_WITH_EVIDENCE).toContain("are not included");
    expect(DIAGRAM_CAP_REASON_WITH_EVIDENCE).toContain("not for marks");
    expect(DIAGRAM_CAP_REASON_WITH_EVIDENCE).toContain("feedback-only release");
    expect(DIAGRAM_CAP_REASON_WITH_EVIDENCE).toContain(
      "does not yet contribute to the mark estimate"
    );
  });

  it("an unrelated attempt (no cap) is untouched by diagram evidence", () => {
    const marked = attemptWith({
      assessment: templateAssessment({
        scoringState: "marked",
        markTotalSource: "explicit",
        recognizedTemplate: null,
        capReason: null,
        marksAssessable: 4,
        marksEarned: 3,
        unassessedMarks: 0,
        diagramMarksUnavailable: null,
        markDisplayMode: "exact_estimate",
      }),
      diagramEvidence: evidence(),
    });
    const p = markPresentation(marked);
    expect(p.reason).toBeNull();
    expect(p.fraction).toBe("3 / 4");
  });
});

// --- QA patch: mutually exclusive no-diagram wording ---------------------------

describe("mentionsUnsubmittedDiagram — the exact contradictions QA found", () => {
  it("matches claims that no diagram/image was provided or credited", () => {
    for (const line of [
      "No image attachment was provided, so the diagram component could not be credited.",
      "No diagram was submitted.",
      "The diagram marks could not be verified.",
      "Without a diagram, the mechanism is asserted rather than shown.",
      "The photo was not included, so the diagram could not be assessed.",
    ]) {
      expect(mentionsUnsubmittedDiagram(line), line).toBe(true);
    }
  });

  it("never matches mixed sentences or non-diagram caveats", () => {
    for (const line of [
      "Your diagram is clear, but you did not explain the shift in demand.",
      "The response addresses only one stakeholder.",
      "The conclusion does not follow from the analysis.",
      "Real-world examples are not used.",
    ]) {
      expect(mentionsUnsubmittedDiagram(line), line).toBe(false);
    }
  });
});

describe("presentedLimitations — contradiction-free beside a reviewed diagram", () => {
  const CONTRADICTION =
    "No image attachment was provided, so the diagram component could not be credited.";
  const UNRELATED = "Only one real-world example was given.";

  it("with evidence: drops no-diagram claims, keeps every other caveat", () => {
    const a = attemptWith({
      assessment: templateAssessment({ limitations: [CONTRADICTION, UNRELATED] }),
      diagramEvidence: evidence(),
    });
    expect(presentedLimitations(a)).toEqual([UNRELATED]);
  });

  it("without evidence: the stored no-diagram wording renders exactly as before", () => {
    const a = attemptWith({
      assessment: templateAssessment({ limitations: [CONTRADICTION, UNRELATED] }),
    });
    expect(presentedLimitations(a)).toEqual([CONTRADICTION, UNRELATED]);
  });

  it("is null-safe for legacy attempts without an assessment", () => {
    const a = attemptWith({ assessment: null, diagramEvidence: evidence() });
    expect(presentedLimitations(a)).toEqual([]);
  });
});

// --- QA patch: stale "add a diagram" advice suppressed, writing advice kept ----

describe("mentionsAddDiagramAdvice", () => {
  it("matches generic add-a-diagram advice", () => {
    for (const line of [
      "Add a fully labelled diagram to support your explanation.",
      "Include a demand and supply diagram showing the shift.",
      "A correctly shifted diagram would strengthen your answer.",
      "You should draw a diagram of the market.",
    ]) {
      expect(mentionsAddDiagramAdvice(line), line).toBe(true);
    }
  });

  it("never matches advice about improving an existing diagram or non-diagram advice", () => {
    for (const line of [
      "Label both axes of your diagram with P and Q.",
      "Mark the new equilibrium on your diagram.",
      "Define price elasticity of demand precisely.",
      "Draw a conclusion about the extent of the change.",
    ]) {
      expect(mentionsAddDiagramAdvice(line), line).toBe(false);
    }
  });
});

describe("presentedFeedback — diagram evidence suppresses ONLY stale diagram advice", () => {
  const withDiagramAdvice: Feedback = {
    score: 4,
    band: "internal",
    strengths: ["Clear chain of reasoning."],
    improvements: [
      "Add a fully labelled diagram to earn the diagram component.",
      "Define subsidy precisely in your first sentence.",
    ],
    mistakes: [],
    examinerComment:
      "A sound explanation, but no diagram was submitted so the diagram component could not be credited.",
    studyNext: "Practise drawing subsidy diagrams with clear labels.",
  };

  it("with evidence on a 4-mark template: add-a-diagram advice goes, writing advice stays", () => {
    const a = attemptWith({
      feedback: withDiagramAdvice,
      diagramEvidence: evidence(),
    });
    const f = presentedFeedback(a);
    expect(f.improvements).toEqual(["Define subsidy precisely in your first sentence."]);
    expect(f.examinerComment).toBe("");
    expect(f.strengths).toEqual(["Clear chain of reasoning."]);
    // Practice advice about drawing better diagrams is not an "add one" claim.
    expect(f.studyNext).toBe("Practise drawing subsidy diagrams with clear labels.");
  });

  it("without evidence: the stored feedback renders exactly as before", () => {
    const a = attemptWith({ feedback: withDiagramAdvice });
    expect(presentedFeedback(a)).toEqual(withDiagramAdvice);
  });
});
