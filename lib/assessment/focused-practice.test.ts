import { describe, expect, it } from "vitest";
import { focusHistory, focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import { answerPracticeFocus, currentPracticeFocus, focusedPracticeHref, focusMatchesSettings, focusPolicy, focusSummary, sameFocus } from "./focused-practice";
import { buildLearningInsights } from "./readiness";
import { resolveQuestionGeneratorTarget, verifiedPracticeFocus } from "./question-generator";
import { ECONOMICS_QUESTION_BANK } from "./question-bank/economics-v1";
import { selectCuratedQuestion } from "./question-bank/economics-v1/selection";

describe("shared focus contract", () => {
  it.each([
    ["Knowledge and terminology", "definition", 2, "paper2_short_analytic"],
    ["Economic analysis", "economic_analysis", 10, "paper1a_10_mark"],
    ["Application to context", "application", 15, "paper1b_15_mark"],
    ["Evaluation and judgment", "evaluation", 15, "paper1b_15_mark"],
  ] as const)("maps %s to an honest task", (label, skill, marks, framework) => {
    const attempts = focusHistory(label);
    const target = resolveQuestionGeneratorTarget({ marks, topicCode: "2.8", courseLevel: "sl", attempts, requestCurrentFocus: true });
    expect(target).toMatchObject({ targetSkill: skill, markTotal: marks, framework, focus: { serverVerified: true, source: "current_focus" } });
    const href = focusedPracticeHref(currentPracticeFocus(buildLearningInsights(attempts).nextFocus)!);
    const params = new URL(href, "http://local").searchParams;
    expect(params.get("topic")).toBe("2.8"); expect(params.get("marks")).toBe(String(marks)); expect(params.get("skill")).toBe(skill);
  });
  it.each(["data_interpretation", "calculation", "policy_recommendation", "structure"] as const)("does not map %s to an essay", skill => {
    expect(focusPolicy(skill)).toBeNull();
  });
  it("routes a supported assessed diagram weakness to four marks without changing the essay routes", () => {
    const item = focusAttempt("Diagram");
    expect(answerPracticeFocus(item)).toBeNull();
    item.assessment!.assessmentSkills = ["diagram_explanation", "economic_analysis"];
    item.assessment!.assessedDiagram = {
      version: 1, state: "usable", contract: { version: "economics-diagram-contract-v1", mode: "four_mark_diagram", diagramRole: "required_explicitly", diagramReason: "The task asks for demand and supply analysis.", provenance: "aptly_authored" },
      componentDecision: null, observations: [], summary: "The submitted supply relationship needs correction.", attachmentHashes: ["synthetic-fixture"], snapshotId: "synthetic-fixture",
    };
    expect(answerPracticeFocus(item)).toMatchObject({ targetSkill: "diagram_explanation", recommendedMarks: 4 });
    expect(focusPolicy("diagram_explanation")).toMatchObject({ marks: 4, framework: "paper2_four_mark_diagram_explain" });
    item.assessment!.assessedDiagram.state = "processing_failure";
    expect(answerPracticeFocus(item)).toBeNull();
  });
  it("keeps answer-specific evidence distinct from global focus", () => {
    const attempts = focusHistory();
    const analysis = focusAttempt("Economic analysis", "3.5", "77777777-7777-4777-8777-777777777777");
    attempts.push(analysis);
    const focus = verifiedPracticeFocus({ source: "answer_feedback", sourceAttemptId: analysis.id, courseLevel: "sl", attempts });
    expect(focus).toMatchObject({ source: "answer_feedback", topicCode: "3.5", targetSkill: "economic_analysis", recommendedMarks: 10, sourceAttemptId: analysis.id });
    expect(focusedPracticeHref(focus)).toContain(`attempt=${analysis.id}`);
    expect(focusedPracticeHref(focus)).not.toBe("/practice");
    expect(focusSummary(focus)).toContain("Practising Analysis");
  });
  it("refuses unowned/missing or historical answer evidence", () => {
    expect(() => verifiedPracticeFocus({ source: "answer_feedback", sourceAttemptId: "absent", attempts: focusHistory(), courseLevel: "sl" })).toThrow("focus_attempt_unavailable");
    const legacy = focusAttempt(); legacy.assessment!.gradingProvenance = undefined;
    expect(answerPracticeFocus(legacy)).toBeNull();
  });
  it("invalid settings cannot retain focus; source and course matter for reuse", () => {
    const focus = verifiedPracticeFocus({ source: "current_focus", attempts: focusHistory(), courseLevel: "sl" });
    expect(focusMatchesSettings(focus, "2.8", 15)).toBe(true);
    expect(focusMatchesSettings(focus, "2.8", 10)).toBe(false);
    expect(focusMatchesSettings(focus, "3.5", 15)).toBe(false);
    expect(sameFocus(focus, { ...focus, courseLevel: "hl" })).toBe(false);
    expect(sameFocus(focus, { ...focus, source: "answer_feedback" })).toBe(false);
    expect(() => resolveQuestionGeneratorTarget({ marks: 10, topicCode: "2.8", attempts: focusHistory(), courseLevel: "sl", requestCurrentFocus: true })).toThrow("focus_changed");
  });
});

describe("strict focused bank selection", () => {
  const target = { marks: 15 as const, topicCode: "2.8", courseLevel: "sl" as const, targetSkill: "application" as const, framework: "paper1b_15_mark" as const, requireSkill: true };
  const matching = ECONOMICS_QUESTION_BANK.filter(q => q.topicCode === "2.8" && q.marks === 15);
  it("selects unseen compatible questions and retains application", () => {
    const selected = selectCuratedQuestion(ECONOMICS_QUESTION_BANK, target, [{ bankQuestionId: matching[0].id, createdAt: "2026-08-18" }], "entropy");
    expect(selected?.targetSkills).toContain("application"); expect(selected?.id).not.toBe(matching[0].id);
  });
  it("wrong-skill questions never prevent fallback", () => {
    const bank = matching.map(q => ({ ...q, targetSkills: ["economic_analysis" as const] }));
    expect(selectCuratedQuestion(bank, target, [], "entropy")).toBeNull();
  });
  it.each([{ marks: 10 as const }, { topicCode: "3.5" }, { framework: "paper1a_10_mark" as const }])("requires matching frame %j", change => {
    expect(selectCuratedQuestion(matching, { ...target, ...change }, [], "entropy")).toBeNull();
  });
  it("rejects HL-only and old taxonomy rows", () => {
    expect(selectCuratedQuestion(matching.map(q => ({ ...q, levelRelevance: "hl_only" as const })), target, [], "entropy")).toBeNull();
    const old = matching.map(q => ({ ...q, taxonomyVersion: "economics-legacy-v3" }));
    expect(selectCuratedQuestion(old as typeof matching, target, [], "entropy")).toBeNull();
  });
  it("exhaustion means all matching questions, irrespective of unrelated unused questions", () => {
    expect(selectCuratedQuestion(ECONOMICS_QUESTION_BANK, target, matching.map(q => ({ bankQuestionId: q.id, createdAt: "2026-08-18" })), "entropy")).toBeNull();
  });
});
