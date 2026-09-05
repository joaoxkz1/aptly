import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { learningLoopAttempt } from "@/lib/testing/learning-loop-fixtures";
import { focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import { FeedbackResult } from "@/components/feedback-result";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { answerPracticeFocus, focusedPracticeHref, FOCUS_INSTRUCTIONS } from "./focused-practice";
import { resolveQuestionGeneratorTarget } from "./question-generator";
import { generalPracticeSuggestion, NEXT_TOPIC_PRACTICE_HREF } from "./general-practice";
import { buildLearningInsights } from "./readiness";
import { ECONOMICS_QUESTION_BANK } from "./question-bank/economics-v1";
import { selectCuratedQuestion } from "./question-bank/economics-v1/selection";
import { SYLLABUS_TOPICS, isCurrentTopLevelHlTopic } from "./taxonomy";
import type { Attempt, MistakeType } from "@/lib/types";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
function permutations<T>(rows: T[]): T[][] {
  return rows.length <= 1 ? [rows] : rows.flatMap((row, i) => permutations(rows.filter((_, j) => i !== j)).map(rest => [row, ...rest]));
}
function render(attempt: Attempt) {
  return renderToStaticMarkup(React.createElement(FeedbackResult, { attempt, saveState: "saved", onTryAnother() {}, onRetry() {}, onRevise() {} }));
}

describe("answer-specific educational priority", () => {
  it.each(["analysis", "evaluation"] as const)("repairs the audited %s transfer independent of every diagnostic ordering", scenario => {
    const attempt = learningLoopAttempt(scenario);
    const skill = scenario === "analysis" ? "economic_analysis" : "evaluation";
    for (const rows of permutations(attempt.assessment!.markBreakdown)) {
      attempt.assessment!.markBreakdown = rows;
      expect(answerPracticeFocus(attempt)?.targetSkill).toBe(skill);
    }
    const focus = answerPracticeFocus(attempt)!;
    const href = new URL(focusedPracticeHref(focus), "http://local");
    const target = resolveQuestionGeneratorTarget({ marks: focus.recommendedMarks!, topicCode: href.searchParams.get("topic")!,
      source: "answer_feedback", sourceAttemptId: attempt.id, attempts: [attempt], courseLevel: "sl", requestCurrentFocus: false });
    expect(target).toMatchObject({ targetSkill: skill, focus: { ...focus, serverVerified: true, courseLevel: "sl" } });
    const question = selectCuratedQuestion(ECONOMICS_QUESTION_BANK, { marks: target.markTotal, topicCode: target.topicCode,
      courseLevel: "sl", targetSkill: target.targetSkill, framework: target.framework, requireSkill: true, evidenceQuestion: attempt.question }, [], "audit");
    expect(question?.targetSkills).toContain(skill);
    expect(question?.question).not.toBe(attempt.question);
    expect(question?.gradingBlueprint.kind).toBe("extended");
    if (question?.gradingBlueprint.kind === "extended") {
      expect(question.gradingBlueprint.analysisPaths.length).toBeGreaterThan(0);
      if (scenario === "evaluation") expect(question.gradingBlueprint.evaluationDirections.length).toBeGreaterThan(0);
    }
    const html = render(attempt);
    expect(html).toContain(FOCUS_INSTRUCTIONS[skill]);
    expect(html.indexOf("Next step")).toBeLessThan(html.indexOf("Strengths"));
    expect(html.match(/>Next step</g)).toHaveLength(1);
    expect(html).toContain("Show me a method");
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html).not.toContain("What to practise next");
    expect(html).not.toContain("Why this band?");
  });
  it("preserves genuine weak definitions and never shows a method cue for knowledge", () => {
    const attempt = learningLoopAttempt("knowledge");
    expect(answerPracticeFocus(attempt)?.targetSkill).toBe("definition");
    expect(render(attempt)).not.toContain("Show me a method");
  });
  it.each(["No real-world example", "Irrelevant real-world example", "Underdeveloped real-world example"] as MistakeType[])("uses %s as application evidence", issue => {
    const a = learningLoopAttempt("analysis"); a.feedback.mistakes = [issue];
    expect(answerPracticeFocus(a)?.targetSkill).toBe("application");
  });
  it("does not turn theoretical errors into definition exercises", () => {
    const a = learningLoopAttempt("analysis"); a.feedback.mistakes = ["Inaccurate economic theory"];
    expect(answerPracticeFocus(a)?.targetSkill).toBe("economic_analysis");
    a.assessment!.assessmentSkills = ["definition"];
    expect(answerPracticeFocus(a)).toBeNull();
  });
  it("a clearly weaker diagnostic takes priority over a higher issue-supported rating", () => {
    const a = learningLoopAttempt("analysis"); a.assessment!.markBreakdown[0].awarded = 1;
    expect(answerPracticeFocus(a)?.targetSkill).toBe("definition");
  });
  it("does not call an unflagged strong 3/4 a deficiency, even if it is the only non-excellent row", () => {
    const a = learningLoopAttempt("analysis");
    a.feedback.mistakes = [];
    a.assessment!.markBreakdown = [a.assessment!.markBreakdown[1]];
    expect(answerPracticeFocus(a)).toBeNull();
  });
  it("absent, legacy or multiple tied issue priorities remain neutral", () => {
    const a = learningLoopAttempt("analysis");
    for (const issues of [undefined, [], ["Missing diagram explanation"], ["Weak terminology", "Underdeveloped economic analysis"]]) {
      a.feedback.mistakes = issues as MistakeType[];
      expect(answerPracticeFocus(a)).toBeNull();
      expect(render(a)).toContain("does not establish one clear supported priority");
      expect(render(a)).not.toContain("source=answer_feedback");
    }
  });
  it("all-excellent ratings stay neutral even with a contradictory issue", () => {
    const a = learningLoopAttempt("analysis"); a.assessment!.markBreakdown.forEach(row => row.awarded = row.available);
    expect(answerPracticeFocus(a)).toBeNull();
  });
  it("ignores unassessed skills and forbids evaluation in Paper 1(a)", () => {
    const a = learningLoopAttempt("evaluation"); a.assessment!.framework = "paper1a_10_mark";
    expect(answerPracticeFocus(a)).toBeNull();
    a.assessment!.framework = "paper1b_15_mark"; a.assessment!.assessmentSkills = ["economic_analysis"];
    expect(answerPracticeFocus(a)).toBeNull();
  });
  it("unsupported and Diagram Evidence gaps do not become supported essays", () => {
    const a = focusAttempt("Data use");
    expect(answerPracticeFocus(a)?.targetSkill).toBe("data_interpretation");
    expect(render(a)).toContain("format is not available yet");
    expect(render(a)).not.toContain("source=answer_feedback");
    a.assessment!.markBreakdown[0].label = "Diagram";
    expect(answerPracticeFocus(a)).toBeNull();
  });
  it("prefers existing different angle metadata and never selects the original question", () => {
    const candidates = ECONOMICS_QUESTION_BANK.filter(q => q.topicCode === "3.6" && q.marks === 10).slice(0, 3);
    const bank = candidates.map((q, i) => ({ ...q, angleTags: i < 2 ? ["spending"] : ["taxation"] }));
    const target = { topicCode: "3.6", marks: 10 as const, courseLevel: "sl" as const, requireSkill: true,
      targetSkill: "economic_analysis" as const, evidenceQuestion: bank[0].question };
    expect(selectCuratedQuestion(bank, target, [], "any")?.id).toBe(bank[2].id);
    expect(selectCuratedQuestion([bank[0]], target, [], "any")).toBeNull();
  });
});

describe("low-history general practice", () => {
  it.each(["sl", "hl"] as const)("uses valid editable defaults at zero, one and several topics for %s", course => {
    for (const topics of [[], ["1.1"], ["1.1", "1.2", "2.1"]]) {
      const attempts = topics.map(topic => { const a = focusAttempt(); a.assessment!.syllabusTopic = topic as "1.1"; return a; });
      const suggestion = generalPracticeSuggestion(attempts, course);
      expect(topics).not.toContain(suggestion.topicCode);
      expect(suggestion.marks).toBe(10);
      const resolved = resolveQuestionGeneratorTarget({ ...suggestion, attempts, courseLevel: course, requestCurrentFocus: false });
      expect(resolved.focus).toBeNull();
      expect(resolveQuestionGeneratorTarget({ ...suggestion, topicCode: "3.5", marks: 2, attempts, courseLevel: course, requestCurrentFocus: false }).markTotal).toBe(2);
    }
  });
  it("excludes HL topics for SL; falls back normally when all eligible topics are covered", () => {
    const all = SYLLABUS_TOPICS.filter(t => t !== "unknown").map(topic => { const a = focusAttempt(); a.assessment!.syllabusTopic = topic; return a; });
    const slCovered = all.filter(a => !isCurrentTopLevelHlTopic(a.assessment!.syllabusTopic));
    expect(generalPracticeSuggestion(slCovered, "sl")).toEqual({ topicCode: "1.1", marks: 10, suggested: false });
    expect(isCurrentTopLevelHlTopic(generalPracticeSuggestion(slCovered, "hl").topicCode)).toBe(true);
    expect(generalPracticeSuggestion(all, "hl").suggested).toBe(false);
  });
  it("the low-evidence card opens Practice and keeps the own-question path", () => {
    const a = learningLoopAttempt("knowledge");
    const html = renderToStaticMarkup(React.createElement(NextFocusCard, { insights: buildLearningInsights([a]) }));
    expect(html).toContain(NEXT_TOPIC_PRACTICE_HREF.replace("&", "&amp;"));
    expect(html).toContain('href="/submit"');
    expect(html).not.toContain("source=answer_feedback");
  });
});
