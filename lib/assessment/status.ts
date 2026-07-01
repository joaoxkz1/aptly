import type { Assessment, AssessmentFramework, Attempt, Feedback, MistakeType, ScoringState } from "@/lib/types";

/**
 * A diagram Aptly cannot yet inspect is NOT a diagnosed student weakness. When
 * a diagram was expected but not submitted (text-only release), never surface
 * "Missing diagram explanation" as a recurring mistake. Pure — reused by the
 * server grader and unit-tested here.
 */
export function stripUnassessableDiagramMistake(
  mistakes: MistakeType[],
  diagramExpected: boolean,
  diagramSubmitted: boolean
): MistakeType[] {
  if (diagramExpected && !diagramSubmitted) {
    return mistakes.filter((m) => m !== "Missing diagram explanation");
  }
  return mistakes;
}

/**
 * Corrective wording that implies source data/figures were available — must not
 * appear in feedback for a Paper 2(g)/3(b) attempt where the source was NOT
 * supplied. Data use is UNAVAILABLE there, never a student weakness.
 */
const SOURCE_DATA_WORDING =
  /(supplied (data|text|source|figures?|extract)|provided (data|text|figures?)|the figures?\b|the extract\b|the source (text|data|material)|quote (the )?(source|extract|data)|refer to the (figures?|source|extract|data|table|chart)|use the (supplied|provided|source) (data|text|figures?)|data[- ]use\b|according to the (source|extract|figures?|data))/i;

export function mentionsSourceData(text: string): boolean {
  return SOURCE_DATA_WORDING.test(text);
}

/**
 * Remove source-data corrective wording from feedback for a source-less
 * Paper 2(g)/3(b) attempt. Feedback on policy, theory, reasoning, evaluation,
 * and structure is preserved. Pure — reused by the feedback view and tested.
 */
export function filterSourceDataFeedback(feedback: Feedback): Feedback {
  return {
    ...feedback,
    strengths: feedback.strengths.filter((s) => !mentionsSourceData(s)),
    improvements: feedback.improvements.filter((s) => !mentionsSourceData(s)),
    examinerComment: mentionsSourceData(feedback.examinerComment) ? "" : feedback.examinerComment,
    studyNext: mentionsSourceData(feedback.studyNext) ? "" : feedback.studyNext,
  };
}

/**
 * Paper 2(g) and Paper 3(b) depend on supplied source text/data. Aptly must not
 * produce a confirmed mark for them unless the source material was actually
 * provided (`sourceMaterialProvided === true`). This gate is applied wherever a
 * status or eligibility is derived, so a source-less attempt — new OR pre-patch
 * — is treated as feedback-only and excluded from core analytics.
 */
export function requiresSourceMaterial(framework: AssessmentFramework | undefined): boolean {
  return framework === "paper2g_15_mark" || framework === "paper3b_10_mark";
}

/** True when a source-dependent framework attempt lacks its confirmed source. */
export function isSourceMaterialMissing(a: Assessment): boolean {
  return requiresSourceMaterial(a.framework) && a.sourceMaterialProvided !== true;
}

/**
 * THE canonical per-attempt status interpreter (Assessment Integrity).
 *
 * Every surface — feedback, Learning log, Dashboard, Analytics — reads an
 * attempt's status through here. No page may infer marked/provisional/
 * feedback-only from partial fields on its own. Pure and client-safe.
 *
 * Trust model:
 *  - NEW attempts (graded post-release) carry a server-derived `scoringState`
 *    and `eligibleForCoreAnalytics`; those are authoritative and simply read.
 *  - LEGACY attempts (no assessment, or a pre-v2 assessment with no
 *    `scoringState`) are derived conservatively and keep their EXACT prior
 *    core-eligibility. They are never silently upgraded or reinterpreted.
 */

/**
 * Defensive re-check of the stored mark arithmetic. The overall mark is a
 * best-fit / analytic judgement, so the diagnostic breakdown is NOT required to
 * sum to it — only the mark ordering (earned ≤ assessable ≤ available) is checked.
 */
function validArithmetic(a: Assessment): boolean {
  if (a.marksAvailable == null || a.marksAssessable == null || a.marksEarned == null) return false;
  if (!(a.marksEarned >= 0 && a.marksEarned <= a.marksAssessable)) return false;
  if (!(a.marksAssessable <= a.marksAvailable)) return false;
  return true;
}

function isLegacyAssessment(a: Assessment): boolean {
  return a.scoringState === undefined;
}

/** The one canonical status for an attempt. */
export function deriveScoringState(attempt: Attempt): ScoringState {
  const a = attempt.assessment;
  if (a == null) return "legacy_unscored";

  // New attempts: trust the server-stamped state, EXCEPT a source-dependent
  // framework with no confirmed source material is always feedback-only (this
  // also conservatively catches pre-patch Paper 2(g)/3(b) attempts).
  if (!isLegacyAssessment(a)) {
    if (isSourceMaterialMissing(a)) return "feedback_only";
    return a.scoringState as ScoringState;
  }

  // Legacy assessment (pre-v2): derive conservatively; never upgrade.
  if (a.markDisplayMode === "practice_feedback_only") return "feedback_only";
  if (
    (a.markDisplayMode === "exact_estimate" || a.markDisplayMode === "partial_estimate") &&
    validArithmetic(a)
  ) {
    return "marked";
  }
  return "legacy_unscored";
}

/**
 * Whether an attempt feeds CORE analytics (Economics level, mark trend, marked
 * topic performance, marks-lost). Only fully "marked" attempts qualify.
 */
export function isCoreEligible(attempt: Attempt): boolean {
  const a = attempt.assessment;
  if (attempt.subject !== "Economics" || a == null) return false;

  if (!isLegacyAssessment(a)) {
    // Source-dependent framework with no confirmed source → never core.
    if (isSourceMaterialMissing(a)) return false;
    // New model: an explicit / user-confirmed total, fully "marked".
    return (
      a.scoringState === "marked" &&
      a.eligibleForCoreAnalytics === true &&
      a.marksAvailable != null &&
      a.marksAssessable != null &&
      a.marksAssessable >= 1 &&
      a.marksEarned != null &&
      validArithmetic(a)
    );
  }

  // Legacy: preserve the EXACT prior eligibility (grandfathered — no change).
  return (
    a.markDisplayMode === "exact_estimate" &&
    a.marksSource !== "not_reliably_known" &&
    a.marksAvailable != null &&
    a.marksAssessable != null &&
    a.marksAssessable >= 1 &&
    a.marksEarned != null &&
    validArithmetic(a)
  );
}

// --- Display -------------------------------------------------------------

export type MarkTone = "marked" | "provisional" | "feedback" | "legacy";

export interface MarkPresentation {
  state: ScoringState;
  tone: MarkTone;
  /** "12 / 15" for marked, "2 / 4" for provisional; null otherwise. earned / total. */
  fraction: string | null;
  /** Short primary label, e.g. "Estimated mark", "Likely", "Feedback only". */
  primaryLabel: string;
  /** Secondary label, e.g. "Provisional estimate". */
  secondaryLabel: string | null;
  /** One-line reason (cap reason, or why no mark). */
  reason: string | null;
}

/** earned / available (the full total). The cap reason explains any gap. */
function fractionOf(a: Assessment): string | null {
  if (a.marksEarned == null || a.marksAvailable == null) return null;
  return `${a.marksEarned} / ${a.marksAvailable}`;
}

/** Everything a mark display needs, resolved once from the canonical state. */
export function markPresentation(attempt: Attempt): MarkPresentation {
  const state = deriveScoringState(attempt);
  const a = attempt.assessment;

  if (state === "marked") {
    return {
      state,
      tone: "marked",
      fraction: a ? fractionOf(a) : null,
      primaryLabel: "Estimated mark",
      secondaryLabel: null,
      reason: a?.capReason ?? null,
    };
  }
  if (state === "provisional") {
    return {
      state,
      tone: "provisional",
      fraction: a ? fractionOf(a) : null,
      primaryLabel: "Likely",
      secondaryLabel: "Provisional estimate",
      reason:
        a?.capReason ??
        (a?.recognizedTemplate
          ? "Inferred from a recognised diagram-explain format."
          : "Inferred mark total — lower confidence."),
    };
  }
  if (state === "feedback_only") {
    return {
      state,
      tone: "feedback",
      fraction: null,
      primaryLabel: "Feedback only",
      secondaryLabel: null,
      reason: "No reliable mark total identified.",
    };
  }
  // legacy_unscored
  return {
    state,
    tone: "legacy",
    fraction: null,
    primaryLabel: "Earlier attempt",
    secondaryLabel: null,
    reason: null,
  };
}
