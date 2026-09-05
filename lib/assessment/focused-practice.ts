import type { AssessmentSkill, Attempt, MarkBreakdownLabel, PracticeQuestion } from "@/lib/types";
import type { EconomicsCourseLevel } from "./course-level";
import type { NextFocus } from "./readiness";
import { CURRENT_SYLLABUS_TOPIC_SHORT_LABELS, ECONOMICS_TAXONOMY_VERSION, resolveEconomicsTaxonomyVersion } from "./taxonomy";
import { isSourceMaterialMissing } from "./status";

/** The supported task shapes, shared by links, UI and server selection. */
export const FOCUSED_PRACTICE_POLICY = {
  definition: { label: "Knowledge", marks: 2, framework: "paper2_short_analytic", paper: "paper_2", questionPart: "a", reasoning: "Define the relevant economic concept accurately, or distinguish its meaning." },
  economic_analysis: { label: "Analysis", marks: 10, framework: "paper1a_10_mark", paper: "paper_1", questionPart: "a", reasoning: "Explain a meaningful causal chain using economic theory; evaluation is not required." },
  application: { label: "Application", marks: 15, framework: "paper1b_15_mark", paper: "paper_1", questionPart: "b", reasoning: "Integrate relevant real-world examples into analysis and judgment in an extended response." },
  evaluation: { label: "Evaluation", marks: 15, framework: "paper1b_15_mark", paper: "paper_1", questionPart: "b", reasoning: "Weigh arguments, conditions and trade-offs to reach a supported judgment." },
} as const;
export type SupportedFocusSkill = keyof typeof FOCUSED_PRACTICE_POLICY;
export type FocusSource = "current_focus" | "answer_feedback";
export type FocusSkill = AssessmentSkill | "structure";

const SKILL_FOR_DIAGNOSTIC: Record<MarkBreakdownLabel, FocusSkill> = {
  "Knowledge and terminology": "definition",
  "Economic analysis": "economic_analysis",
  "Application to context": "application",
  "Evaluation and judgment": "evaluation",
  "Structure and clarity": "structure",
  "Data use": "data_interpretation",
  "Calculation method": "calculation",
  "Final answer": "calculation",
  Diagram: "diagram_explanation",
  "Policy recommendation": "policy_recommendation",
};
export function focusSkillForDiagnostic(label: MarkBreakdownLabel): FocusSkill {
  return SKILL_FOR_DIAGNOSTIC[label];
}
export function focusPolicy(skill: FocusSkill) {
  return Object.hasOwn(FOCUSED_PRACTICE_POLICY, skill)
    ? FOCUSED_PRACTICE_POLICY[skill as SupportedFocusSkill]
    : null;
}
export interface PracticeFocus {
  source: FocusSource;
  sourceAttemptId: string | null;
  topicCode: string;
  taxonomyVersion: typeof ECONOMICS_TAXONOMY_VERSION;
  targetSkill: FocusSkill;
  recommendedMarks: 2 | 10 | 15 | null;
  courseLevel: EconomicsCourseLevel | null;
  explanation: string;
  serverVerified: boolean;
}

function intent(source: FocusSource, topicCode: string, label: MarkBreakdownLabel, explanation: string, sourceAttemptId: string | null): PracticeFocus {
  const targetSkill = SKILL_FOR_DIAGNOSTIC[label];
  return { source, sourceAttemptId, topicCode, taxonomyVersion: ECONOMICS_TAXONOMY_VERSION,
    targetSkill, recommendedMarks: focusPolicy(targetSkill)?.marks ?? null,
    courseLevel: null, explanation, serverVerified: false };
}
export function currentPracticeFocus(focus: NextFocus | null): PracticeFocus | null {
  if (!focus || focus.taxonomyVersion !== ECONOMICS_TAXONOMY_VERSION) return null;
  return intent("current_focus", focus.topicCode, focus.skillLabel, focus.explanation, null);
}
/** Answer-specific diagnostics; never substitute the student's global focus. */
export function answerPracticeFocus(attempt: Attempt): PracticeFocus | null {
  const a = attempt.assessment;
  if (!a || a.scoringState !== "marked" || a.eligibleForCoreAnalytics !== true ||
      resolveEconomicsTaxonomyVersion(a.gradingProvenance?.taxonomyVersion) !== ECONOMICS_TAXONOMY_VERSION ||
      a.syllabusTopic === "unknown" || isSourceMaterialMissing(a)) return null;
  const weakest = a.markBreakdown.filter(row => row.label !== "Diagram" && row.available > 0 && row.awarded < row.available)
    .sort((left, right) => left.awarded / left.available - right.awarded / right.available)[0];
  if (!weakest) return null;
  return intent("answer_feedback", a.syllabusTopic, weakest.label, weakest.reason, attempt.id);
}
export function focusedPracticeHref(focus: PracticeFocus): string {
  const params = new URLSearchParams({ source: focus.source, topic: focus.topicCode,
    skill: focus.targetSkill, taxonomy: focus.taxonomyVersion });
  if (focus.recommendedMarks !== null) params.set("marks", String(focus.recommendedMarks));
  if (focus.sourceAttemptId !== null) params.set("attempt", focus.sourceAttemptId);
  return `/practice?${params}`;
}
export function focusMatchesSettings(focus: PracticeFocus, topicCode: string, marks: number): boolean {
  return focus.topicCode === topicCode && focus.recommendedMarks === marks && focusPolicy(focus.targetSkill) !== null;
}
export function focusLabel(focus: PracticeFocus): string {
  return focusPolicy(focus.targetSkill)?.label ?? ({ structure: "Structure", data_interpretation: "Data use", calculation: "Calculation", policy_recommendation: "Policy recommendation", diagram_explanation: "Diagram" } as Record<string, string>)[focus.targetSkill] ?? focus.targetSkill;
}
export function focusSummary(focus: PracticeFocus): string {
  const topic = CURRENT_SYLLABUS_TOPIC_SHORT_LABELS[focus.topicCode as keyof typeof CURRENT_SYLLABUS_TOPIC_SHORT_LABELS];
  return `${focusPolicy(focus.targetSkill) ? "Practising" : "Requested focus:"} ${focusLabel(focus)} · ${topic ?? focus.topicCode}${focus.recommendedMarks === null ? "" : ` · ${focus.recommendedMarks} marks`}`;
}
export function sameFocus(left: PracticeFocus | null | undefined, right: PracticeFocus | null | undefined): boolean {
  if (!left || !right) return !left && !right;
  return left.serverVerified && right.serverVerified && left.source === right.source &&
    left.sourceAttemptId === right.sourceAttemptId && left.targetSkill === right.targetSkill &&
    left.topicCode === right.topicCode && left.taxonomyVersion === right.taxonomyVersion &&
    left.recommendedMarks === right.recommendedMarks && left.courseLevel === right.courseLevel;
}
/** Historical booleans alone never establish a focused task. */
export function savedPracticeFocus(question: PracticeQuestion): PracticeFocus | null {
  const focus = question.focus;
  const policy = focus && focusPolicy(focus.targetSkill);
  return focus?.serverVerified && policy && question.skill === focus.targetSkill &&
    question.framework === policy.framework && question.topicCode === focus.topicCode &&
    question.markTotal === policy.marks && question.taxonomyVersion === focus.taxonomyVersion
    ? focus : null;
}
