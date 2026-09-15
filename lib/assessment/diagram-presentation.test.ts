import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AssessedDiagramSummary, AssessmentComponents } from "@/components/assessment/assessment-components";
import { MarkBreakdown } from "@/components/assessment/mark-breakdown";
import { AnswerNextStep } from "@/components/assessment/answer-next-step";
import { focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import { buildLearningInsights } from "./readiness";
import { visibleDiagnosticRows } from "./display";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
// Synthetic policy-output fixture, not a vision evaluation or teacher label.
function combined() {
  const attempt = focusAttempt("Diagram");
  attempt.assessment!.version = 4;
  attempt.assessment!.assessmentSkills = ["diagram_explanation", "economic_analysis"];
  attempt.assessment!.marksAvailable = attempt.assessment!.marksAssessable = 4;
  attempt.assessment!.marksEarned = 2;
  attempt.assessment!.assessedDiagram = {
    version: 1, state: "usable",
    contract: { version: "economics-diagram-contract-v1", mode: "four_mark_diagram", diagramRole: "required_explicitly", diagramReason: "This question requires a diagram and its explanation.", provenance: "aptly_authored" },
    componentDecision: { diagram: 2, explanation: 2, rawTotal: 4, total: 2,
      ceilings: [{ rule: "mechanism_consistency_2", maximum: 2, reason: "The diagram and explanation use incompatible mechanisms." }],
      reasons: { diagram: "The supply shift is clear.", explanation: "The written mechanism is independently valid." }, rootErrors: [] },
    observations: [{ region: "Main graph", observation: "The supply curve shifts left.", interpretation: "Supply decreases.", uncertain: false }],
    summary: "Reconcile the diagram and explanation.", attachmentHashes: ["synthetic"], snapshotId: "synthetic",
  };
  return attempt;
}
describe("combined diagram feedback presentation", () => {
  it("explains a ceiling rather than presenting unreconciled awarded component marks", () => {
    const html = renderToStaticMarkup(React.createElement(AssessmentComponents, { attempt: combined() }));
    expect(html).toContain("Diagram credit before ceiling");
    expect(html).toContain("Explanation credit before ceiling");
    expect(html).toContain("Overall ceiling: 2 / 4");
    expect(html).toContain("The component credit totals 4");
    expect(html).toContain("Estimated total");
  });
  it("shows image observations separately from interpretation and legacy copy", () => {
    const html = renderToStaticMarkup(React.createElement(AssessedDiagramSummary, { attempt: combined() }));
    expect(html).toContain("The supply curve shifts left.");
    expect(html).toContain("Interpretation:");
    expect(html).not.toContain("does not change your mark");
    expect(renderToStaticMarkup(React.createElement(AssessedDiagramSummary, { attempt: focusAttempt() }))).toBe("");
  });
  it("includes assessed diagram diagnostics and excludes non-applicable skills", () => {
    const attempt = combined();
    attempt.assessment!.markBreakdown.push({ label: "Evaluation and judgment", available: 0, awarded: 0, reason: "Not assessed." });
    const html = renderToStaticMarkup(React.createElement(MarkBreakdown, { assessment: attempt.assessment! }));
    expect(html).toContain("Diagram");
    expect(html).not.toContain("Evaluation and judgment");
    expect(visibleDiagnosticRows(focusAttempt("Diagram").assessment!.markBreakdown)).toEqual([]);
  });
  it("allows assessed diagrams into skill priorities while preserving legacy isolation and revision collapse", () => {
    const before = focusAttempt("Diagram");
    expect(buildLearningInsights([before]).skillPriority).toEqual([]);
    const first = combined();
    const revision = { ...combined(), id: "66666666-6666-4666-8666-666666666666", parentAttemptId: first.id, createdAt: "2026-09-15T10:00:00Z" };
    const insights = buildLearningInsights([first, revision]);
    expect(insights.skillPriority.find(row => row.label === "Diagram")?.responses).toBe(1);
  });
  it("keeps an independent 3/4 Diagram diagnostic visible as a gap despite full component credit before a labeling ceiling", () => {
    const attempt = combined();
    const assessment = attempt.assessment!;
    assessment.marksEarned = 3;
    assessment.assessedDiagram!.componentDecision = {
      diagram: 2, explanation: 2, rawTotal: 4, total: 3,
      ceilings: [{ rule: "question_label_ceiling_3", maximum: 3, reason: "Both axis variable labels are missing." }],
      reasons: { diagram: "The supply contraction and both equilibrium outcomes are visible.", explanation: "The causal chain is developed." },
      rootErrors: [],
    };
    assessment.markBreakdown = [
      { label: "Diagram", awarded: 3, available: 4, reason: "Correct geometry; both axis variable labels are missing." },
    ];

    const diagnostics = renderToStaticMarkup(React.createElement(MarkBreakdown, { assessment }));
    expect(diagnostics).toContain("Secure");
    expect(diagnostics).not.toContain("Strong");
    expect(diagnostics).toContain("both axis variable labels are missing");
    const components = renderToStaticMarkup(React.createElement(AssessmentComponents, { attempt }));
    expect(components).toContain("Diagram credit before ceiling");
    expect(components).toContain("The component credit totals 4");
    expect(components).toContain("Overall ceiling: 3 / 4");
    expect(buildLearningInsights([attempt]).skillPriority.find(row => row.label === "Diagram"))
      .toMatchObject({ lost: 1, available: 4, percentLost: 25, responses: 1 });
    expect(assessment.assessedDiagram!.componentDecision).toMatchObject({ diagram: 2, explanation: 2, total: 3 });
  });
  it("puts a binding component issue's saved next step in the main advice", () => {
    const attempt = combined();
    attempt.feedback.studyNext = "Make the mechanisms in the diagram and explanation agree.";
    const html = renderToStaticMarkup(React.createElement(AnswerNextStep, { attempt, saved: true, onTryAnother: () => {}, tryAnotherLabel: "Another answer" }));
    expect(html).toContain("Make the mechanisms in the diagram and explanation agree.");
    expect(html).not.toContain("Saved study advice");
    expect(html).toContain("Revise the limiting part");
  });
});
