import type { AssessmentFramework, MarkTotalSource, RubricTemplateId, ScoringState } from "@/lib/types";
import { ASSESSMENT_FRAMEWORKS } from "./taxonomy";
import { isValidMarkTotal, runPreflight, type PreflightResult } from "./preflight";
import { matchTemplate, templateById, type RubricTemplate } from "./templates";
import { frameworkPolicy, requiresSourceMaterial, type MarkingMethod } from "./frameworks";

// A recognised source paste must carry real content, not just a line of prose.
export const MIN_SOURCE_MATERIAL_CHARS = 20;
// A bare reference ("using the data provided") is not source material.
export const MIN_SOURCE_MATERIAL_WORDS = 5;

export function hasUsableSourceMaterial(source: string | null | undefined): boolean {
  if (typeof source !== "string") return false;
  const t = source.trim();
  if (t.length < MIN_SOURCE_MATERIAL_CHARS) return false;
  return t.split(/\s+/).length >= MIN_SOURCE_MATERIAL_WORDS;
}

/**
 * Server-authoritative scoring policy (Assessment Integrity + IB Marking
 * Fidelity).
 *
 * Given the pasted question and the student's preflight choice, this decides —
 * with trusted deterministic logic, NEVER the model — whether the attempt is
 * marked/provisional/feedback-only, the denominator, the recognised IB marking
 * framework and marking method (from the canonical framework registry), and
 * whether the recognised template caps the diagram marks. The model later
 * marks only the assessable portion within this frame.
 */

export type RequestedSource = MarkTotalSource | "feedback_only";

export interface PreflightChoice {
  /** What the student chose after the compact preflight (null before any choice). */
  requestedSource: RequestedSource | null;
  /** The exact total when the student typed/confirmed one (user_confirmed). */
  requestedTotal: number | null;
  /** Echoed template id when the student accepted a recognised inference. */
  templateId: string | null;
  /** The marking framework the student confirmed for an ambiguous 10/15 total. */
  requestedFramework: AssessmentFramework | null;
  /** Pasted source text/data for a Paper 2(g)/3(b) attempt (null = none supplied). */
  sourceMaterial: string | null;
}

export type PolicyState = Exclude<ScoringState, "legacy_unscored">;

export interface ScoringPolicy {
  scoringState: PolicyState;
  markTotalSource: MarkTotalSource;
  /** The server-derived IB marking framework. */
  framework: AssessmentFramework;
  /** How the assessable marks are judged (canonical framework registry). */
  markingMethod: MarkingMethod;
  /** True when the framework uses an IB best-fit markband model (10/15 papers). */
  bestFit: boolean;
  /** marksAvailable (full total); null only for feedback-only. */
  total: number | null;
  /** marksAssessable (what Aptly can judge); null only for feedback-only. */
  assessable: number | null;
  /** total - assessable; the template diagram marks capped away (0 otherwise). */
  cappedDiagramMarks: number;
  recognizedTemplate: RubricTemplateId | null;
  capReason: string | null;
  /** true/false for Paper 2(g)/3(b); null for every other framework. */
  sourceMaterialProvided: boolean | null;
  /**
   * The question-part slice a user-confirmed total belongs to (multi-part
   * pastes) — server-derived from its own detection, never client text. Used
   * for template recognition and as the grading context so the model marks the
   * selected part, not every part. Null when the whole paste is the question.
   */
  selectedQuestionPart: string | null;
}

const FEEDBACK_ONLY: ScoringPolicy = {
  scoringState: "feedback_only",
  markTotalSource: "unknown",
  framework: "generic_practice",
  markingMethod: "holistic_practice",
  bestFit: false,
  total: null,
  assessable: null,
  cappedDiagramMarks: 0,
  recognizedTemplate: null,
  capReason: null,
  sourceMaterialProvided: null,
  selectedQuestionPart: null,
};

/** Resolve the framework: confirmed guess, else the student's confirmed choice. */
function resolveFramework(pf: PreflightResult, requestedFramework: AssessmentFramework | null): AssessmentFramework {
  if (pf.frameworkConfirmed) return pf.framework;
  if (requestedFramework != null && pf.frameworkOptions.includes(requestedFramework)) {
    return requestedFramework;
  }
  // Ambiguous 10/15 with no valid confirmation → never claim a paper.
  return "generic_practice";
}

/**
 * Resolve the authoritative policy. A conscious student choice is honored
 * first when it is SAFE: feedback-only is the most conservative state, and a
 * user-confirmed total is the student's own denominator (always kept generic,
 * never a paper claim). Then a single trustworthy explicit total in the text
 * wins and is "marked". A question with MULTIPLE distinct explicit totals —
 * or only an uncertain citation-like bracket — is never marked from the first
 * regex hit: without a conscious user-confirmed total (or feedback-only) it
 * resolves to feedback-only.
 */
export function resolveScoringPolicy(question: string, choice: PreflightChoice): ScoringPolicy {
  const pf = runPreflight(question);

  let state: PolicyState;
  let source: MarkTotalSource;
  let total: number;
  let selectedPart: string | null = null;

  if (choice.requestedSource === "feedback_only") {
    return FEEDBACK_ONLY;
  }

  if (choice.requestedSource === "user_confirmed" && isValidMarkTotal(choice.requestedTotal)) {
    state = "marked";
    source = "user_confirmed";
    total = choice.requestedTotal;
    // The selected part comes from the SERVER's own detection (never client
    // text): the candidate slice whose total matches the confirmed choice.
    // Only meaningful when the paste contains several detected parts.
    if (pf.explicitTotals.length > 1) {
      selectedPart = pf.explicitTotals.find((t) => t.marks === total)?.partText ?? null;
    }
  } else if (pf.kind === "explicit" && pf.total != null) {
    state = "marked";
    source = "explicit";
    total = pf.total;
  } else if (
    choice.requestedSource === "template_inferred" &&
    pf.kind === "inference" &&
    pf.total != null
  ) {
    state = "provisional";
    source = "template_inferred";
    total = pf.total;
  } else {
    return FEEDBACK_ONLY;
  }

  // A user-confirmed total is a raw number with no paper context → generic.
  const framework =
    source === "user_confirmed" ? "generic_practice" : resolveFramework(pf, choice.requestedFramework);

  const policy = buildPolicy(question, selectedPart, choice.templateId, state, source, total, framework);
  return applySourceRequirement(policy, choice.sourceMaterial);
}

/**
 * Paper 2(g)/3(b) require supplied source text/data. Without usable source, the
 * attempt becomes feedback-only (framework retained for the header) and never
 * receives a confirmed mark, best-fit band, or core-analytics contribution.
 */
function applySourceRequirement(policy: ScoringPolicy, sourceMaterial: string | null): ScoringPolicy {
  if (!requiresSourceMaterial(policy.framework)) return policy;

  if (hasUsableSourceMaterial(sourceMaterial)) {
    return { ...policy, sourceMaterialProvided: true };
  }

  return {
    scoringState: "feedback_only",
    markTotalSource: "unknown",
    framework: policy.framework, // retained so the header can say "Paper 2(g) feedback only"
    markingMethod: "holistic_practice",
    bestFit: false,
    total: null,
    assessable: null,
    cappedDiagramMarks: 0,
    recognizedTemplate: null,
    capReason: null,
    sourceMaterialProvided: false,
    selectedQuestionPart: policy.selectedQuestionPart,
  };
}

/**
 * Server-authoritative REVISION source gate (old-source revision fix).
 *
 * When a grade revises an attempt whose SERVER-STORED framework is a
 * source-dependent Paper 2(g)/3(b), no client input may produce a marked
 * frame without usable source material — however the client phrased the
 * request (a user-confirmed total resolves to a generic marked frame with no
 * source gate of its own, which would ask the model to mark a data-response
 * answer without its text: an impossible frame it fails). With the parent's
 * framework as ground truth, a source-less request is downgraded to an honest
 * feedback-only policy that RETAINS the paper framework for the header.
 * Requests with usable source (stored or re-pasted), non-source parents, and
 * already-feedback-only policies pass through untouched.
 */
export function enforceRevisionSourceGate(
  policy: ScoringPolicy,
  parentFramework: string | null,
  sourceMaterial: string | null
): ScoringPolicy {
  if (parentFramework == null) return policy;
  if (!(ASSESSMENT_FRAMEWORKS as readonly string[]).includes(parentFramework)) return policy;
  const framework = parentFramework as AssessmentFramework;
  if (!requiresSourceMaterial(framework)) return policy;
  if (policy.scoringState === "feedback_only") return policy;
  if (hasUsableSourceMaterial(sourceMaterial)) return policy;

  return {
    scoringState: "feedback_only",
    markTotalSource: "unknown",
    framework, // retained so the header can say "Paper 3(b) feedback only"
    markingMethod: "holistic_practice",
    bestFit: false,
    total: null,
    assessable: null,
    cappedDiagramMarks: 0,
    recognizedTemplate: null,
    capReason: null,
    sourceMaterialProvided: false,
    selectedQuestionPart: policy.selectedQuestionPart,
  };
}

/**
 * Server-authoritative policy for an Aptly-GENERATED practice question. The
 * framework and total come from the user's own private practice_questions row
 * (validated at generation time) — never from client text or the model. The
 * source requirement still applies: a source-dependent framework without its
 * stored generated source degrades to feedback-only exactly like a pasted
 * question. Throws on any unsupported framework/total so the grade route
 * fails closed rather than marking an unvetted frame.
 */
export function policyForGeneratedPractice(input: {
  framework: string;
  markTotal: number;
  sourceMaterial: string | null;
}): ScoringPolicy {
  const framework = input.framework as AssessmentFramework;
  const supported: readonly string[] = [
    "paper2_short_analytic",
    "paper1a_10_mark",
    "paper1b_15_mark",
    "paper2g_15_mark",
    "paper3b_10_mark",
    "generic_practice",
  ];
  if (!supported.includes(input.framework)) {
    throw new Error("unsupported generated-practice framework");
  }
  if (!isValidMarkTotal(input.markTotal)) {
    throw new Error("invalid generated-practice mark total");
  }
  const entry = frameworkPolicy(framework);
  const policy: ScoringPolicy = {
    scoringState: "marked",
    markTotalSource: "explicit", // the generated question states its total explicitly
    framework,
    markingMethod: entry.markingMethod,
    bestFit: entry.showBestFitBands,
    total: input.markTotal,
    assessable: input.markTotal,
    cappedDiagramMarks: 0, // generated questions never depend on a diagram
    recognizedTemplate: null,
    capReason: null,
    sourceMaterialProvided: null,
    selectedQuestionPart: null,
  };
  return applySourceRequirement(policy, input.sourceMaterial);
}

/**
 * The recognised 4-mark diagram-explain component policy applies when either
 * the framework itself is the recognised structure, or a user-confirmed
 * total's own SELECTED question part matches the template. In the second case
 * the generic-practice label is retained — the 2+2 cap is a structural fact,
 * not a paper claim — so a multi-part paste where the student picks the
 * 4-mark diagram part is still capped at its written component.
 */
function resolveTemplate(
  question: string,
  selectedPart: string | null,
  echoedTemplateId: string | null,
  source: MarkTotalSource,
  total: number,
  framework: AssessmentFramework
): RubricTemplate | null {
  let template: RubricTemplate | null = null;
  if (framework === "paper2_four_mark_diagram_explain") {
    template = templateById(echoedTemplateId) ?? matchTemplate(question);
  } else if (source === "user_confirmed") {
    // Server-side matching ONLY (the echoed client id is never trusted here).
    template = matchTemplate(selectedPart ?? question);
  }
  return template != null && total === template.totalMarks ? template : null;
}

/**
 * Assemble the final policy from the canonical framework registry. The
 * recognised 4-mark diagram framework caps its diagram marks (text-only
 * release → no assessable diagram). Every other framework is fully assessable
 * — an essay or an explicit-paper analytic part is NEVER capped for a missing
 * diagram, and an explicit paper label (e.g. Paper 3(a)) never inherits the
 * template.
 */
function buildPolicy(
  question: string,
  selectedPart: string | null,
  echoedTemplateId: string | null,
  state: PolicyState,
  source: MarkTotalSource,
  total: number,
  framework: AssessmentFramework
): ScoringPolicy {
  const entry = frameworkPolicy(framework);
  const template = resolveTemplate(question, selectedPart, echoedTemplateId, source, total, framework);

  if (template != null) {
    return {
      scoringState: state,
      markTotalSource: source,
      framework,
      markingMethod: "template_component",
      bestFit: entry.showBestFitBands,
      total,
      assessable: template.writtenMarks,
      cappedDiagramMarks: template.diagramMarks,
      recognizedTemplate: template.id,
      capReason: template.capReason,
      sourceMaterialProvided: null,
      selectedQuestionPart: selectedPart,
    };
  }

  // No cap: everything is assessable.
  return {
    scoringState: state,
    markTotalSource: source,
    framework,
    markingMethod: entry.markingMethod,
    bestFit: entry.showBestFitBands,
    total,
    assessable: total,
    cappedDiagramMarks: 0,
    recognizedTemplate: null,
    capReason: null,
    sourceMaterialProvided: null,
    selectedQuestionPart: selectedPart,
  };
}
