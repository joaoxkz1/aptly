import type { Assessment, AssessmentSkill, Attempt, MarkBreakdownLabel, MistakeType, PracticeQuestion } from "@/lib/types";
import type { EconomicsCourseLevel } from "./course-level";
import type { NextFocus } from "./readiness";
import { CURRENT_SYLLABUS_TOPIC_SHORT_LABELS, ECONOMICS_TAXONOMY_VERSION, resolveEconomicsTaxonomyVersion } from "./taxonomy";
import { isSourceMaterialMissing } from "./status";

/** The supported task shapes, shared by links, UI and server selection. */
export const FOCUSED_PRACTICE_POLICY = {
  diagram_explanation: { label: "Diagram", marks: 4, framework: "paper2_four_mark_diagram_explain", paper: "unknown", questionPart: "unknown", reasoning: "Draw the relevant economic relationship and explain how it produces the outcome in this task." },
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
  recommendedMarks: 2 | 4 | 10 | 15 | null;
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
// Only existing controlled issue labels. A theory error is not evidence that
// a definition exercise is needed; source/diagram/calculation gaps stay distinct.
const SKILL_FOR_ISSUE: Partial<Record<MistakeType, FocusSkill>> = {
  "Missing diagram explanation": "diagram_explanation",
  "Missing required diagram": "diagram_explanation",
  "Weak definitions": "definition",
  "Weak terminology": "definition",
  "Inaccurate economic theory": "economic_analysis",
  "Underdeveloped economic analysis": "economic_analysis",
  "Lack of evaluation": "evaluation",
  "Underdeveloped evaluation": "evaluation",
  "Unsupported judgement": "evaluation",
  "No real-world example": "application",
  "Irrelevant real-world example": "application",
  "Underdeveloped real-world example": "application",
  "Insufficient source use": "data_interpretation",
  "Calculation/setup error": "calculation",
  "Unclear structure": "structure",
};

export const FOCUS_INSTRUCTIONS: Record<SupportedFocusSkill, string> = {
  diagram_explanation: "Use the diagram feedback to improve the relevant relationship, then explain the same mechanism in your writing.",
  definition: "Check the meaning of the relevant concept and use its terminology accurately.",
  economic_analysis: "Develop the causal chain from the initial change to the outcome the question asks about.",
  application: "Connect relevant example details to your economic reasoning and judgment.",
  evaluation: "Explain how a condition or trade-off changes your reasoning, then use it to support your judgment.",
};

function diagnosticAssessed(a: Assessment, label: MarkBreakdownLabel): boolean {
  // Knowledge/clarity have no dedicated assessmentSkills entry for essays.
  // Their saved qualitative rows are the evidence that they were assessed.
  if (label === "Knowledge and terminology" || label === "Structure and clarity") return true;
  if (label === "Diagram") return Boolean(a.assessedDiagram &&
    ["usable", "partially_readable", "no_relevant_diagram", "not_provided"].includes(a.assessedDiagram.state));
  const skill = SKILL_FOR_DIAGNOSTIC[label];
  if (!a.assessmentSkills.includes(skill as AssessmentSkill)) return false;
  // A stray diagnostic/tag must not impose evaluation on an explanation.
  if (skill === "evaluation") return ["paper1b_15_mark", "paper2g_15_mark", "paper3b_10_mark", "generic_practice"].includes(a.framework ?? "");
  return true;
}

/**
 * Answer-specific policy (also recomputed by the server):
 * 1. Only valid, genuinely assessed, non-excellent diagnostic rows qualify.
 * 2. Lowest ratio wins. At a tied lowest ratio, a unique issue-supported skill
 *    wins; multiple supported skills or an unsupported tie remain ambiguous.
 * 3. A lone 0..2/4 (partial or weaker) needs no issue tag. A 3/4 is STRONG,
 *    so it needs a matching structured issue before being called a priority.
 * Never rank by row order, issue order/count, or free-text keywords. Excellent
 * rows cannot be made into gaps by contradictory tags. No global substitution.
 */
export function answerPracticeFocus(attempt: Attempt): PracticeFocus | null {
  const a = attempt.assessment;
  if (!a || a.scoringState !== "marked" || a.eligibleForCoreAnalytics !== true ||
      resolveEconomicsTaxonomyVersion(a.gradingProvenance?.taxonomyVersion) !== ECONOMICS_TAXONOMY_VERSION ||
      a.syllabusTopic === "unknown" || isSourceMaterialMissing(a)) return null;
  const rows = a.markBreakdown.filter(row => diagnosticAssessed(a, row.label) &&
    Number.isFinite(row.available) && Number.isFinite(row.awarded) &&
    row.available > 0 && row.awarded >= 0 && row.awarded < row.available);
  if (!rows.length) return null;
  const lowest = Math.min(...rows.map(row => row.awarded / row.available));
  const weakest = rows.filter(row => row.awarded / row.available === lowest);
  const diagnosed = new Set((attempt.feedback.mistakes ?? []).map(issue => SKILL_FOR_ISSUE[issue]).filter(Boolean));
  const supported = weakest.filter(row => diagnosed.has(SKILL_FOR_DIAGNOSTIC[row.label]));
  const candidates = supported.length ? supported : lowest <= 0.5 ? weakest : [];
  const skills = new Set(candidates.map(row => SKILL_FOR_DIAGNOSTIC[row.label]));
  if (skills.size !== 1) return null;
  const skill = SKILL_FOR_DIAGNOSTIC[candidates[0].label];
  const instruction = focusPolicy(skill)
    ? FOCUS_INSTRUCTIONS[skill as SupportedFocusSkill]
    : "Review the feedback for this skill; this focused-practice format is not available yet.";
  return intent("answer_feedback", a.syllabusTopic, candidates[0].label, instruction, attempt.id);
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
