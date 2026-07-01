import type { AssessmentFramework, MarkTotalSource, RubricTemplateId, ScoringState } from "@/lib/types";
import { isValidMarkTotal, runPreflight, type PreflightResult } from "./preflight";
import { matchTemplate, templateById } from "./templates";
import { isBestFitFramework } from "./bands";
import { requiresSourceMaterial } from "./status";

// A recognised source paste must carry real content, not just a line of prose.
export const MIN_SOURCE_MATERIAL_CHARS = 20;

export function hasUsableSourceMaterial(source: string | null | undefined): boolean {
  return typeof source === "string" && source.trim().length >= MIN_SOURCE_MATERIAL_CHARS;
}

/**
 * Server-authoritative scoring policy (Assessment Integrity + IB Marking
 * Fidelity).
 *
 * Given the pasted question and the student's preflight choice, this decides —
 * with trusted deterministic logic, NEVER the model — whether the attempt is
 * marked/provisional/feedback-only, the denominator, the recognised IB marking
 * framework, and whether a recognised template caps the diagram marks. The
 * model later marks only the assessable portion within this frame.
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
}

const FEEDBACK_ONLY: ScoringPolicy = {
  scoringState: "feedback_only",
  markTotalSource: "unknown",
  framework: "generic_practice",
  bestFit: false,
  total: null,
  assessable: null,
  cappedDiagramMarks: 0,
  recognizedTemplate: null,
  capReason: null,
  sourceMaterialProvided: null,
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
 * Resolve the authoritative policy. The question text is ground truth: an
 * explicit total always wins and is always "marked", regardless of the client.
 * Otherwise the student's preflight choice decides between a confirmed total
 * (marked), an accepted inference (provisional), or feedback-only.
 */
export function resolveScoringPolicy(question: string, choice: PreflightChoice): ScoringPolicy {
  const pf = runPreflight(question);

  let state: PolicyState;
  let source: MarkTotalSource;
  let total: number;

  if (pf.kind === "explicit" && pf.total != null) {
    state = "marked";
    source = "explicit";
    total = pf.total;
  } else if (choice.requestedSource === "user_confirmed" && isValidMarkTotal(choice.requestedTotal)) {
    state = "marked";
    source = "user_confirmed";
    total = choice.requestedTotal;
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

  const policy = buildPolicy(question, choice.templateId, state, source, total, framework);
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
    bestFit: false,
    total: null,
    assessable: null,
    cappedDiagramMarks: 0,
    recognizedTemplate: null,
    capReason: null,
    sourceMaterialProvided: false,
  };
}

/**
 * Assemble the final policy. The recognised 4-mark diagram framework caps its
 * diagram marks (text-only release → no assessable diagram). Every other
 * framework is fully assessable — an essay is NEVER capped for a missing diagram.
 */
function buildPolicy(
  question: string,
  echoedTemplateId: string | null,
  state: PolicyState,
  source: MarkTotalSource,
  total: number,
  framework: AssessmentFramework
): ScoringPolicy {
  const bestFit = isBestFitFramework(framework);

  if (framework === "paper2_four_mark_diagram_explain") {
    const template = templateById(echoedTemplateId) ?? matchTemplate(question);
    if (template != null && total === template.totalMarks) {
      return {
        scoringState: state,
        markTotalSource: source,
        framework,
        bestFit,
        total,
        assessable: template.writtenMarks,
        cappedDiagramMarks: template.diagramMarks,
        recognizedTemplate: template.id,
        capReason: template.capReason,
        sourceMaterialProvided: null,
      };
    }
  }

  // No cap: everything is assessable.
  return {
    scoringState: state,
    markTotalSource: source,
    framework,
    bestFit,
    total,
    assessable: total,
    cappedDiagramMarks: 0,
    recognizedTemplate: null,
    capReason: null,
    sourceMaterialProvided: null,
  };
}
