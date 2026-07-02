import type { AssessmentFramework } from "@/lib/types";
import type { RequestedSource } from "./policy";
import { isValidMarkTotal, runPreflight, type PreflightResult } from "./preflight";
import { requiresSourceMaterial } from "./frameworks";
import type { RevisionContext } from "./revisions";
import type { DetectedTotalOverride } from "@/components/submit/mark-total-notice";

/**
 * THE submit-decision engine (Practice Loop).
 *
 * Pure and unit-tested: given the question, the revision/practice context, and
 * the student's visible total override, decide exactly ONE action for a
 * "Grade my answer" click:
 *
 *  - "grade"        → call the grading route with this decision NOW
 *  - "source_step"  → open the Paper 2(g)/3(b) source-material step first
 *  - "choice"       → open the compact preflight chooser (totals/framework)
 *  - "invalid_custom_total" → the typed override total is unusable
 *
 * The submit page renders whatever this returns — it holds no duplicate
 * branching, so the flow that reaches the paid grading call is provable in
 * tests. HARD RULE (old-source revision fix): a revision of a source-dependent
 * Paper 2(g)/3(b) attempt with NO safely stored source ALWAYS opens the source
 * step first — whatever the question's mark-total detection says — so grading
 * can never run before the student either supplies the source again or
 * consciously chooses feedback-only.
 */

export interface GradeDecision {
  requestedSource: RequestedSource | null;
  requestedTotal: number | null;
  templateId: string | null;
  requestedFramework: AssessmentFramework | null;
  sourceMaterial: string | null;
}

export type SubmitAction =
  | { kind: "grade"; decision: GradeDecision }
  | {
      kind: "source_step";
      preflight: PreflightResult;
      /** The framework the source step should open for (never client-invented:
          either the server-stored parent framework preference or the question's
          own confirmed framework). */
      sourceFramework: AssessmentFramework | null;
    }
  | { kind: "choice"; preflight: PreflightResult }
  | { kind: "invalid_custom_total" };

export function resolveSubmitAction(input: {
  /** The (trimmed) question being answered. */
  question: string;
  /** True when this grade answers an Aptly-generated practice question
      (directly or as a revision of one) — the server holds its frame. */
  practiceLinked: boolean;
  /** Trusted revision context, when revising. */
  revisionCtx: RevisionContext | null;
  /** The student's visible pre-grade override of a detected total. */
  totalOverride: DetectedTotalOverride;
}): SubmitAction {
  const { revisionCtx, totalOverride } = input;

  // 1. Generated practice (including a revision of one): the server grades
  // against ITS stored question, source, framework, and total — no preflight.
  if (input.practiceLinked) {
    return {
      kind: "grade",
      decision: {
        requestedSource: null,
        requestedTotal: null,
        templateId: null,
        requestedFramework: null,
        sourceMaterial: null,
      },
    };
  }

  const pf = runPreflight(input.question);

  // 2. OLD-SOURCE REVISION GATE (the fix): a source-dependent revision with no
  // stored source anywhere goes to the source step FIRST, unconditionally.
  // Every other branch below could otherwise reach a marked frame that grades
  // a data-response question without its text.
  if (revisionCtx?.needsSourceAgain) {
    return {
      kind: "source_step",
      preflight: pf,
      sourceFramework: revisionCtx.preferredFramework,
    };
  }

  // 3. Revision: the one denominator that cannot be re-detected from the text
  // is a previously USER-CONFIRMED total — reuse it instead of re-asking.
  if (revisionCtx !== null && revisionCtx.confirmedTotal !== null) {
    return {
      kind: "grade",
      decision: {
        requestedSource: "user_confirmed",
        requestedTotal: revisionCtx.confirmedTotal,
        templateId: pf.templateId,
        requestedFramework: null,
        sourceMaterial: null,
      },
    };
  }

  // 4. Revision with a RETAINED source (Paper 2(g)/3(b)): grade straight away.
  // The server retrieves the parent's stored source itself — no re-paste, and
  // no way to silently swap in a different source for the comparison.
  if (revisionCtx?.storedSource != null && pf.kind === "explicit") {
    const confirmedFramework =
      !pf.frameworkConfirmed &&
      revisionCtx.preferredFramework != null &&
      pf.frameworkOptions.includes(revisionCtx.preferredFramework)
        ? revisionCtx.preferredFramework
        : null;
    if (pf.frameworkConfirmed || confirmedFramework != null) {
      return {
        kind: "grade",
        decision: {
          requestedSource: "explicit",
          requestedTotal: pf.total,
          templateId: pf.templateId,
          requestedFramework: confirmedFramework,
          sourceMaterial: null, // server-side: the parent's stored source wins
        },
      };
    }
  }

  if (pf.kind === "explicit") {
    // The student's visible pre-grade override of the detected total.
    if (totalOverride.mode === "feedback_only") {
      return {
        kind: "grade",
        decision: {
          requestedSource: "feedback_only",
          requestedTotal: null,
          templateId: null,
          requestedFramework: null,
          sourceMaterial: null,
        },
      };
    }
    if (totalOverride.mode === "custom") {
      const parsed = Number.parseInt(totalOverride.total, 10);
      if (!isValidMarkTotal(parsed)) {
        return { kind: "invalid_custom_total" };
      }
      return {
        kind: "grade",
        decision: {
          requestedSource: "user_confirmed",
          requestedTotal: parsed,
          templateId: pf.templateId,
          requestedFramework: null,
          sourceMaterial: null,
        },
      };
    }
    // Revision of an ambiguous 10/15 answer whose framework the student
    // already confirmed once: reuse it (the server still validates it against
    // its own detected options). Source-dependent preferences never reach
    // here — the needsSourceAgain/storedSource rules above already decided.
    if (
      !pf.frameworkConfirmed &&
      revisionCtx?.preferredFramework != null &&
      pf.frameworkOptions.includes(revisionCtx.preferredFramework)
    ) {
      if (!requiresSourceMaterial(revisionCtx.preferredFramework)) {
        return {
          kind: "grade",
          decision: {
            requestedSource: "explicit",
            requestedTotal: pf.total,
            templateId: pf.templateId,
            requestedFramework: revisionCtx.preferredFramework,
            sourceMaterial: null,
          },
        };
      }
      return { kind: "source_step", preflight: pf, sourceFramework: revisionCtx.preferredFramework };
    }
    // Grade immediately only when the total AND the marking framework are both
    // safe to use. An ambiguous 10/15 total needs a compact framework choice; a
    // Paper 2(g)/3(b) framework needs its source text/data first.
    if (pf.frameworkConfirmed && !requiresSourceMaterial(pf.framework)) {
      return {
        kind: "grade",
        decision: {
          requestedSource: "explicit",
          requestedTotal: pf.total,
          templateId: pf.templateId,
          requestedFramework: null,
          sourceMaterial: null,
        },
      };
    }
  }

  // Multiple distinct totals, an unconfirmed framework, a source-dependent
  // framework, or no total at all → the compact choice decides before grading.
  // An explicit Paper 2(g)/3(b) opens straight into the source step.
  if (pf.kind === "explicit" && pf.frameworkConfirmed && requiresSourceMaterial(pf.framework)) {
    return { kind: "source_step", preflight: pf, sourceFramework: pf.framework };
  }
  return { kind: "choice", preflight: pf };
}
