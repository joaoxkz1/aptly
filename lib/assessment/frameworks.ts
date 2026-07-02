import type { AssessmentFramework } from "@/lib/types";
import { ASSESSMENT_FRAMEWORK_LABELS } from "./taxonomy";
import { isBestFitFramework } from "./bands";

/**
 * THE canonical marking-policy registry (IB Marking Engine).
 *
 * Pure, no secrets — safe on client and server. One auditable table answers,
 * per framework: how the assessable marks are judged, whether a confirmed
 * estimate requires pasted source text/data, whether official best-fit bands
 * may be displayed, how diagrams are treated, and the student-facing label.
 *
 * There is deliberately NO universal rubric across mark totals:
 *  - Paper 1(a)/1(b) and Paper 2(g)/3(b) use IB best-fit markband judgement.
 *  - Paper 2(a)/(b) and Paper 3(a) are question-specific analytic marking —
 *    a Paper 3(a) 4-mark explain must never inherit the Paper 2(c)–(f) 2+2.
 *  - Only the recognised 4-mark diagram-explain uses the 2+2 component split.
 *  - Generic practice gets an honest holistic estimate with no paper claim
 *    and no official band display.
 *
 * The MODEL never chooses any of this: frameworks come from explicit paper
 * labels, recognised templates, or explicit student confirmation (preflight +
 * `resolveScoringPolicy`), and the registry entries are static server truth.
 */

export type MarkingMethod =
  | "best_fit" // holistic IB markband judgement (10/15-mark papers)
  | "analytic" // question-specific analytic mini-markscheme
  | "template_component" // recognised 2 written + 2 diagram component split
  | "holistic_practice"; // honest practice estimate, no paper markscheme assumed

export type DiagramPolicy =
  | "relevant_where_needed" // diagrams credited only where they support the answer; never compulsory, never a cap
  | "template_component" // diagram marks exist as a component; capped away when unassessable
  | "question_specific"; // only if the exact question tests one; no universal rule

export interface FrameworkPolicyEntry {
  /** How the assessable marks are judged. */
  markingMethod: MarkingMethod;
  /** Confirmed estimates require pasted readable source text/data first. */
  requiresSourceMaterial: boolean;
  /** Whether official IB-style best-fit bands are valid to display. */
  showBestFitBands: boolean;
  /** Diagram stance — never a universal cap outside the recognised template. */
  diagramPolicy: DiagramPolicy;
  /** Student-facing label authority (single source: taxonomy labels). */
  studentLabel: string;
}

function entry(
  framework: AssessmentFramework,
  markingMethod: MarkingMethod,
  requiresSource: boolean,
  diagramPolicy: DiagramPolicy
): FrameworkPolicyEntry {
  return {
    markingMethod,
    requiresSourceMaterial: requiresSource,
    showBestFitBands: isBestFitFramework(framework),
    diagramPolicy,
    studentLabel: ASSESSMENT_FRAMEWORK_LABELS[framework],
  };
}

export const FRAMEWORK_REGISTRY: Record<AssessmentFramework, FrameworkPolicyEntry> = {
  // Recognised short 1–2 mark response: analytic, question-specific.
  paper2_short_analytic: entry("paper2_short_analytic", "analytic", false, "question_specific"),
  // Recognised Paper 2(c)–(f)-style diagram-explain: the ONLY 2+2 component split.
  paper2_four_mark_diagram_explain: entry(
    "paper2_four_mark_diagram_explain",
    "template_component",
    false,
    "template_component"
  ),
  // Paper 2(a): accurate non-verbatim definitions can earn full marks; the
  // definition itself does not depend on the stimulus, so no source gate.
  paper2a_definition: entry("paper2a_definition", "analytic", false, "question_specific"),
  // Paper 2(b): quantitative/diagram task; figures usually sit in the pasted
  // question itself, so no separate source gate. No automatic explanation
  // requirement, no 2+2 split.
  paper2b_quantitative: entry("paper2b_quantitative", "analytic", false, "question_specific"),
  // Paper 1: best-fit markbands; diagrams only where relevant, never capped.
  paper1a_10_mark: entry("paper1a_10_mark", "best_fit", false, "relevant_where_needed"),
  paper1b_15_mark: entry("paper1b_15_mark", "best_fit", false, "relevant_where_needed"),
  // Paper 2(g): data response — a confirmed estimate REQUIRES pasted source.
  paper2g_15_mark: entry("paper2g_15_mark", "best_fit", true, "relevant_where_needed"),
  // Paper 3(a): variable-mark analytic subparts; data sits in the pasted
  // question; NEVER inherits the 2+2 diagram template.
  paper3a_analytic: entry("paper3a_analytic", "analytic", false, "question_specific"),
  // Paper 3(b): data-supported recommendation — REQUIRES pasted source.
  paper3b_10_mark: entry("paper3b_10_mark", "best_fit", true, "relevant_where_needed"),
  // Explicit/confirmed total but no safely established paper format.
  generic_practice: entry("generic_practice", "holistic_practice", false, "relevant_where_needed"),
};

export function frameworkPolicy(framework: AssessmentFramework): FrameworkPolicyEntry {
  return FRAMEWORK_REGISTRY[framework];
}

/**
 * Paper 2(g) and Paper 3(b) depend on supplied source text/data. Aptly must
 * not produce a confirmed mark for them unless the source material was
 * actually provided. This gate is applied wherever a status or eligibility is
 * derived, so a source-less attempt — new OR pre-patch — is treated as
 * feedback-only and excluded from core analytics.
 */
export function requiresSourceMaterial(framework: AssessmentFramework | undefined): boolean {
  return framework != null && FRAMEWORK_REGISTRY[framework].requiresSourceMaterial;
}
