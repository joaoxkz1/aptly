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
import { derivePracticeTarget } from "./practice-target";

export interface ResolvedQuestionTarget extends AdaptivePracticeTarget {
  why: string;
  fromCurrentFocus: boolean;
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
}): ResolvedQuestionTarget {
  if (!isCurrentGeneratorTopic(input.topicCode)) throw new Error("invalid current topic");
  if (input.courseLevel === "sl" && isCurrentTopLevelHlTopic(input.topicCode)) {
    throw new Error("topic is HL-only");
  }

  const topicLabel = CURRENT_SYLLABUS_TOPIC_LABELS[input.topicCode];
  const focus = input.requestCurrentFocus ? derivePracticeTarget(input.attempts) : null;
  const matchedFocus =
    focus !== null &&
    focus.taxonomyVersion === ECONOMICS_TAXONOMY_VERSION &&
    focus.topicCode === input.topicCode;

  return {
    topicCode: input.topicCode,
    topicLabel,
    markTotal: input.marks,
    framework: FRAMEWORK_FOR_MARK[input.marks],
    levelRelevance: isCurrentTopLevelHlTopic(input.topicCode) ? "hl_only" : "shared_sl_hl",
    targetSkill: matchedFocus ? focus.skill : DEFAULT_SKILL_FOR_MARK[input.marks],
    why: matchedFocus
      ? focus.why
      : `You chose ${topicLabel} for a ${input.marks}-mark practice question.`,
    fromCurrentFocus: matchedFocus,
  };
}
