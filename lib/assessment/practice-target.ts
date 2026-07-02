import type {
  AssessmentFramework,
  AssessmentSkill,
  Attempt,
  MarkBreakdownLabel,
} from "@/lib/types";
import { buildLearningInsights, type NextFocus } from "./readiness";
import { requiresSourceMaterial } from "./frameworks";
import { collapseRevisionChains } from "./revisions";
import { nextFocusPresentation } from "./display";

/**
 * Practice Loop — server-authoritative targeted-practice derivation.
 *
 * Pure and deterministic. The generation route recomputes this from the
 * user's SAVED attempts; the client never chooses the topic, skill, framework,
 * difficulty, or mark total. Only frameworks Aptly can already mark safely are
 * ever targeted — and NEVER the 4-mark diagram template (diagram upload is the
 * next release, so no generated task may depend on an unassessable diagram).
 */

export const GENERATED_PRACTICE_FRAMEWORKS = [
  "paper2_short_analytic",
  "paper1a_10_mark",
  "paper1b_15_mark",
  "paper2g_15_mark",
  "paper3b_10_mark",
  "generic_practice",
] as const;

export type GeneratedPracticeFramework = (typeof GENERATED_PRACTICE_FRAMEWORKS)[number];

export function isGeneratedPracticeFramework(
  value: unknown
): value is GeneratedPracticeFramework {
  return (
    typeof value === "string" && (GENERATED_PRACTICE_FRAMEWORKS as readonly string[]).includes(value)
  );
}

export interface PracticeTarget {
  topicCode: string;
  topicLabel: string;
  /** The diagnostic skill the focus names (canonical breakdown label). */
  focusSkillLabel: MarkBreakdownLabel;
  /** The controlled assessment skill the generated question practises. */
  skill: AssessmentSkill;
  framework: GeneratedPracticeFramework;
  markTotal: number;
  /** True for Paper 2(g)/3(b): Aptly must generate an original text source. */
  requiresSource: boolean;
  /** Evidence-backed "Why this question?" copy (from stored data only). */
  why: string;
  /** Evidence level carried from the canonical next focus. */
  reliability: NextFocus["reliability"];
  confidenceTier: NextFocus["confidenceTier"];
}

/** True when the collapsed core-evidence set contains this exact framework. */
function hasFrameworkEvidence(attempts: Attempt[], framework: AssessmentFramework): boolean {
  return collapseRevisionChains(attempts).some((a) => a.assessment?.framework === framework);
}

interface FormatChoice {
  skill: AssessmentSkill;
  framework: GeneratedPracticeFramework;
  markTotal: number;
}

/**
 * Framework selection policy: the target format follows the diagnostic skill.
 * A specific IB paper framework is claimed only when it is intrinsically tied
 * to the skill (data use → Paper 2(g); policy recommendation → Paper 3(b)) or
 * when the student's own marked evidence already contains that paper format
 * (10/15-mark essays). Otherwise the practice stays honestly generic.
 */
function chooseFormat(focusSkillLabel: MarkBreakdownLabel, attempts: Attempt[]): FormatChoice {
  switch (focusSkillLabel) {
    case "Knowledge and terminology":
      return { skill: "definition", framework: "paper2_short_analytic", markTotal: 2 };
    case "Calculation method":
    case "Final answer":
      return { skill: "calculation", framework: "paper2_short_analytic", markTotal: 2 };
    case "Evaluation and judgment":
      return hasFrameworkEvidence(attempts, "paper1b_15_mark")
        ? { skill: "evaluation", framework: "paper1b_15_mark", markTotal: 15 }
        : { skill: "evaluation", framework: "generic_practice", markTotal: 15 };
    case "Data use":
      return { skill: "data_interpretation", framework: "paper2g_15_mark", markTotal: 15 };
    case "Policy recommendation":
      return { skill: "policy_recommendation", framework: "paper3b_10_mark", markTotal: 10 };
    case "Application to context":
      return hasFrameworkEvidence(attempts, "paper1a_10_mark")
        ? { skill: "application", framework: "paper1a_10_mark", markTotal: 10 }
        : { skill: "application", framework: "generic_practice", markTotal: 10 };
    case "Economic analysis":
    case "Structure and clarity":
    case "Diagram": // defensively excluded upstream; never a diagram task
    default:
      return hasFrameworkEvidence(attempts, "paper1a_10_mark")
        ? { skill: "economic_analysis", framework: "paper1a_10_mark", markTotal: 10 }
        : { skill: "economic_analysis", framework: "generic_practice", markTotal: 10 };
  }
}

/**
 * "Why this question?" — worded through the SAME evidence-aware helper as the
 * Dashboard/Analytics next-focus cards, so a single-answer focus never claims
 * to be where the student is "losing the most marks".
 */
function whyCopy(nf: NextFocus): string {
  const p = nextFocusPresentation(nf);
  if (p.early) {
    return `${p.heading} in ${nf.topicLabel}. ${p.evidenceLine}`;
  }
  const evidence = `${nf.responses} marked answer${nf.responses === 1 ? "" : "s"}`;
  return (
    `Your next focus is ${nf.skillLabel} in ${nf.topicLabel} — across ${evidence}, ` +
    `this is where your answers are losing the most marks.`
  );
}

/**
 * Derive the one practice target from the canonical next focus. Returns null
 * when there is not yet enough marked evidence to name a useful focus — the
 * UI then shows honest guidance instead of a generate button.
 */
export function derivePracticeTarget(attempts: Attempt[]): PracticeTarget | null {
  const nf = buildLearningInsights(attempts).nextFocus;
  if (nf == null) return null;

  const format = chooseFormat(nf.skillLabel, attempts);
  return {
    topicCode: nf.topicCode,
    topicLabel: nf.topicLabel,
    focusSkillLabel: nf.skillLabel,
    skill: format.skill,
    framework: format.framework,
    markTotal: format.markTotal,
    requiresSource: requiresSourceMaterial(format.framework),
    why: whyCopy(nf),
    reliability: nf.reliability,
    confidenceTier: nf.confidenceTier,
  };
}
