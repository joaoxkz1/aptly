import "server-only";
import type { EconomicsCourseLevel } from "./course-level";
import type { AssessmentSkill, Attempt } from "@/lib/types";
import type { AdaptivePracticeTarget } from "@/lib/ai/practice-schema";
import type { GeneratorMarkTotal } from "./question-bank/economics-v1/types";
import {
  CURRENT_SYLLABUS_TOPIC_LABELS,
  ECONOMICS_TAXONOMY_VERSION,
  SYLLABUS_TOPICS,
  isCurrentTopLevelHlTopic,
} from "./taxonomy";
import { buildLearningInsights } from "./readiness";
import { collapseRevisionChains } from "./revisions";
import { answerPracticeFocus, currentPracticeFocus, focusMatchesSettings, focusPolicy, focusSkillForDiagnostic, type FocusSource, type PracticeFocus } from "./focused-practice";

export interface ResolvedQuestionTarget extends AdaptivePracticeTarget {
  why: string;
  fromCurrentFocus: boolean;
  focus: PracticeFocus | null;
  evidenceQuestion?: string;
}
export class PracticeFocusError extends Error {
  constructor(public code: "no_focus_available" | "unsupported_focus" | "focus_changed" | "focus_attempt_unavailable") { super(code); }
}

/** Input attempts must be fetched under the authenticated user's RLS. */
export function verifiedPracticeFocus(input: { source: FocusSource; sourceAttemptId?: string | null; attempts: Attempt[]; courseLevel: EconomicsCourseLevel }): PracticeFocus {
  const attempt = input.source === "answer_feedback"
    ? input.attempts.find(a => a.id === input.sourceAttemptId) : null;
  if (input.source === "answer_feedback" && !attempt) throw new PracticeFocusError("focus_attempt_unavailable");
  const focus = input.source === "current_focus"
    ? currentPracticeFocus(buildLearningInsights(input.attempts).nextFocus)
    : answerPracticeFocus(attempt!);
  if (!focus) throw new PracticeFocusError("no_focus_available");
  if (!isCurrentGeneratorTopic(focus.topicCode)) throw new PracticeFocusError("no_focus_available");
  if (input.courseLevel === "sl" && isCurrentTopLevelHlTopic(focus.topicCode)) throw new PracticeFocusError("unsupported_focus");
  return { ...focus, courseLevel: input.courseLevel, serverVerified: true };
}
const FRAMEWORK_FOR_MARK: Record<
  GeneratorMarkTotal,
  AdaptivePracticeTarget["framework"]
> = {
  2: "paper2_short_analytic",
  10: "paper1a_10_mark",
  15: "paper1b_15_mark",
};

const DEFAULT_SKILL_FOR_MARK: Record<GeneratorMarkTotal, AssessmentSkill> = {
  2: "definition",
  10: "economic_analysis",
  15: "evaluation",
};

export function isGeneratorMarkTotal(value: unknown): value is GeneratorMarkTotal {
  return value === 2 || value === 10 || value === 15;
}

export function isCurrentGeneratorTopic(value: unknown): value is Exclude<
  (typeof SYLLABUS_TOPICS)[number],
  "unknown"
> {
  return (
    typeof value === "string" &&
    value !== "unknown" &&
    (SYLLABUS_TOPICS as readonly string[]).includes(value)
  );
}

export function resolveQuestionGeneratorTarget(input: {
  marks: GeneratorMarkTotal;
  topicCode: string;
  courseLevel: EconomicsCourseLevel;
  attempts: Attempt[];
  requestCurrentFocus: boolean;
  source?: FocusSource;
  sourceAttemptId?: string | null;
}): ResolvedQuestionTarget {
  if (!isCurrentGeneratorTopic(input.topicCode)) throw new Error("invalid current topic");
  if (input.courseLevel === "sl" && isCurrentTopLevelHlTopic(input.topicCode)) {
    throw new Error("topic is HL-only");
  }

  const topicLabel = CURRENT_SYLLABUS_TOPIC_LABELS[input.topicCode];
  const source = input.source ?? (input.requestCurrentFocus ? "current_focus" : null);
  const focus = source ? verifiedPracticeFocus({ ...input, source }) : null;
  const policy = focus ? focusPolicy(focus.targetSkill) : null;
  if (focus && !policy) throw new PracticeFocusError("unsupported_focus");
  if (focus && !focusMatchesSettings(focus, input.topicCode, input.marks)) throw new PracticeFocusError("focus_changed");
  const evidence = focus ? (focus.sourceAttemptId
    ? input.attempts.find(a => a.id === focus.sourceAttemptId)
    : collapseRevisionChains(input.attempts).filter(a => a.assessment?.syllabusTopic === focus.topicCode && a.assessment?.eligibleForCoreAnalytics === true &&
        a.assessment?.gradingProvenance?.taxonomyVersion === ECONOMICS_TAXONOMY_VERSION)
      .map(attempt => ({ attempt, row: attempt.assessment!.markBreakdown.find(row => focusSkillForDiagnostic(row.label) === focus.targetSkill && row.available > 0 && row.awarded < row.available) }))
      .filter(item => item.row !== undefined)
      .sort((a, b) => a.row!.awarded / a.row!.available - b.row!.awarded / b.row!.available || b.attempt.createdAt.localeCompare(a.attempt.createdAt))[0]?.attempt) : null;

  return {
    topicCode: input.topicCode,
    topicLabel,
    markTotal: input.marks,
    framework: policy?.framework ?? FRAMEWORK_FOR_MARK[input.marks],
    taxonomyVersion: ECONOMICS_TAXONOMY_VERSION,
    courseLevel: input.courseLevel,
    levelRelevance: isCurrentTopLevelHlTopic(input.topicCode) ? "hl_only" : "shared_sl_hl",
    targetSkill: focus ? focus.targetSkill as AssessmentSkill : DEFAULT_SKILL_FOR_MARK[input.marks],
    why: focus
      ? `${focus.source === "answer_feedback" ? "From this answer's feedback" : "From your current focus"}: ${focus.explanation}`
      : `You chose ${topicLabel} for a ${input.marks}-mark practice question.`,
    fromCurrentFocus: focus?.source === "current_focus",
    focus,
    evidenceQuestion: evidence?.question,
  };
}
