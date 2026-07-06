import type { Assessment, AssessmentMarkBreakdownItem, Attempt, Confidence } from "@/lib/types";
import {
  ASSESSMENT_FRAMEWORK_LABELS,
  SYLLABUS_TOPIC_LABELS,
  SYLLABUS_TOPIC_SHORT_LABELS,
} from "./taxonomy";
import { markPresentation } from "./status";

/** Display helpers for assessment attempts (shared, no secret). */

// --- IB Marking Fidelity: framework + diagnostic display -------------------

export interface FrameworkMeta {
  label: string;
  /** Set when the paper format is not confirmed (generic practice). */
  note: string | null;
}

/** The header meta line: a confirmed framework label, or a practice estimate. */
export function frameworkMeta(a: Assessment): FrameworkMeta {
  const f = a.framework;
  if (f == null) {
    // Legacy attempt (no framework): a neutral total-based label plus the
    // command term — NEVER the model's guessed paper format.
    return { label: `${frameworkShortLabel(a)} · ${a.commandTermLabel}`, note: null };
  }
  if (f === "generic_practice") {
    const total = a.marksAvailable;
    return {
      label: total != null ? `${total}-mark practice estimate` : "Practice response",
      note: "Paper format not confirmed",
    };
  }
  return { label: ASSESSMENT_FRAMEWORK_LABELS[f], note: null };
}

/**
 * A qualitative diagnostic signal from an internal awarded/available ratio.
 * NEVER a mark — used so the student-facing diagnostic rows carry no numeric
 * criterion denominators that could imply an official IB allocation.
 */
export function diagnosticSignal(awarded: number, available: number): string {
  if (available <= 0) return "Demonstrated";
  const ratio = awarded / available;
  if (ratio >= 0.999) return "Strong";
  if (ratio >= 0.6) return "Secure";
  if (ratio >= 0.34) return "Developing";
  return "Needs development";
}

/**
 * The strength of a skill's diagnostic GAP signal, from the internal
 * `percentLost` rank value (0–100). A bigger gap = a stronger "work on this"
 * signal. Deterministic thresholds; deliberately NOT shown as a percentage or
 * an IB mark. See the report for the exact mapping.
 */
export type DiagnosticSignalStrength = "Strong signal" | "Developing signal" | "Limited signal";

export function diagnosticSignalStrength(percentLost: number): DiagnosticSignalStrength {
  if (percentLost >= 50) return "Strong signal";
  if (percentLost >= 25) return "Developing signal";
  return "Limited signal";
}

/**
 * The qualitative diagnostic rows a student may see. Excludes "Diagram" — a
 * diagram Aptly cannot yet inspect is never a diagnosed skill, so it never shows
 * as "Diagram · Needs development". Its honest status lives in the components card.
 */
export function visibleDiagnosticRows(
  items: AssessmentMarkBreakdownItem[]
): AssessmentMarkBreakdownItem[] {
  return items.filter((i) => i.label !== "Diagram");
}

// --- Framework-sourced labels (never the model's assessmentFormat) ----------
// A student-facing paper label must come from the SERVER-confirmed framework.
// A generic/unconfirmed total must never surface a paper label.

/** Compact meta-line label for attempt lists (Learning log, Dashboard recent). */
export function frameworkShortLabel(a: Assessment): string {
  const total = a.marksAvailable;
  switch (a.framework) {
    case "paper1a_10_mark":
      return "Paper 1(a) · 10-mark response";
    case "paper1b_15_mark":
      return "Paper 1(b) · 15-mark extended response";
    case "paper2g_15_mark":
      return "Paper 2(g) · 15-mark data response";
    case "paper3b_10_mark":
      return "Paper 3(b) · 10-mark recommendation";
    case "paper2a_definition":
      return total != null ? `Paper 2(a) · ${total}-mark definition` : "Paper 2(a) · definition";
    case "paper2b_quantitative":
      return total != null ? `Paper 2(b) · ${total}-mark quantitative` : "Paper 2(b) · quantitative";
    case "paper3a_analytic":
      return total != null ? `Paper 3(a) · ${total}-mark analytic` : "Paper 3(a) · analytic";
    case "paper2_four_mark_diagram_explain":
      return "4-mark diagram explanation";
    case "paper2_short_analytic":
      return total != null ? `${total}-mark short response` : "Short response";
    case "generic_practice":
      return total != null ? `${total}-mark practice response` : "Practice response";
    default:
      // Legacy attempt (no framework) — never leak the model's paper format.
      return total != null ? `${total}-mark response` : "Practice response";
  }
}

/** Short label for the Analytics "performance by format" card, grouped by framework. */
export function frameworkFormatLabel(a: Assessment): string {
  const total = a.marksAvailable;
  switch (a.framework) {
    case "paper1a_10_mark":
      return "Paper 1(a)";
    case "paper1b_15_mark":
      return "Paper 1(b)";
    case "paper2g_15_mark":
      return "Paper 2(g)";
    case "paper3b_10_mark":
      return "Paper 3(b)";
    case "paper2a_definition":
      return "Paper 2(a)";
    case "paper2b_quantitative":
      return "Paper 2(b)";
    case "paper3a_analytic":
      return "Paper 3(a)";
    case "paper2_four_mark_diagram_explain":
      return "4-mark diagram explanation";
    case "paper2_short_analytic":
      return total != null ? `${total}-mark short` : "Short response";
    case "generic_practice":
    default:
      return total != null ? `${total}-mark practice` : "Practice";
  }
}

/** Grouping key for performance-by-format: framework, splitting generic by total. */
export function frameworkFormatKey(a: Assessment): string {
  const f = a.framework ?? "generic_practice";
  if (f === "generic_practice" || f === "paper2_short_analytic") {
    return `${f}:${a.marksAvailable ?? "x"}`;
  }
  return f;
}

/**
 * Card-level Coverage note for answers that expected a diagram (count is
 * text-derived, exactly as before). Truthful about Diagram Evidence V1:
 * diagram photo review exists as separate study feedback, and it stays fully
 * outside marks and Coverage metrics — this note never claims review is
 * unavailable or that no diagram has ever been looked at.
 */
export function diagramEvidenceNote(count: number): { title: string; body: string } {
  return {
    title: "Diagram evidence kept separate",
    body: `Aptly assessed the related written explanation in ${count} answer${count === 1 ? "" : "s"}. Diagram photo review is available when you attach a diagram to an answer, and its feedback stays separate from marks and Coverage metrics in this version of Aptly.`,
  };
}

export function confidenceLabel(c: Confidence): string {
  return c === "high" ? "High" : c === "medium" ? "Medium" : "Low";
}

// --- Curated topic labels --------------------------------------------------
// One deliberate display label per controlled topic code. Analytics ALWAYS
// group by the code; these normalise display so raw classifier variants can
// never fragment a topic. Never a truncated fragment.

export function topicDisplayLabel(code: string): string {
  return SYLLABUS_TOPIC_LABELS[code as keyof typeof SYLLABUS_TOPIC_LABELS] ?? "Unclassified topic";
}

/** A deliberate compact label for dense/compact layouts; full label as fallback. */
export function topicShortLabel(code: string): string {
  return (
    SYLLABUS_TOPIC_SHORT_LABELS[code as keyof typeof SYLLABUS_TOPIC_SHORT_LABELS] ??
    topicDisplayLabel(code)
  );
}

// --- UI-only short skill labels (headings / compact cards) -----------------
// These NEVER feed grouping, analytics, thresholds, or recommendation logic.

const SHORT_SKILL_LABELS: Record<string, string> = {
  "Knowledge and terminology": "Knowledge",
  "Economic analysis": "Analysis",
  "Application to context": "Application",
  "Evaluation and judgment": "Evaluation",
  "Data use": "Data use",
  Diagram: "Diagram",
  "Calculation method": "Calculation",
  "Final answer": "Final answer",
  "Policy recommendation": "Policy",
  "Structure and clarity": "Structure",
};

/** A compact skill word for headings (canonical label unchanged elsewhere). */
export function shortSkillLabel(label: string): string {
  return SHORT_SKILL_LABELS[label] ?? label;
}

// --- Next-focus evidence-honest presentation ---------------------------------
// DISPLAY ONLY: the targeting algorithm, core eligibility, and analytics are
// untouched. With a single independent marked answer behind the focus, Aptly
// must not claim a "weakest skill" or "losing the most marks" — it offers an
// early focus to test. Every surface that words the next focus (Dashboard,
// Analytics, the practice "Why this question?", feedback entry points) reads
// this ONE helper so the strength of the claim can never drift between pages.

/** Independent marked answers required before the stronger wording is used. */
export const NEXT_FOCUS_STRONG_EVIDENCE_MIN = 2;

export interface NextFocusPresentation {
  /** True when the focus rests on fewer than the strong-evidence minimum. */
  early: boolean;
  /** "Weakest skill: Evaluation" or "Early focus to test: Evaluation". */
  heading: string;
  /** Honest evidence caption for the early state; null for strong evidence. */
  evidenceLine: string | null;
  /** Supporting sentence matched to the strength of the claim. */
  explanation: string;
}

/** The one evidence-aware wording for a next focus (pure; feeds every surface). */
export function nextFocusPresentation(nf: {
  skillLabel: string;
  responses: number;
  explanation: string;
}): NextFocusPresentation {
  if (nf.responses < NEXT_FOCUS_STRONG_EVIDENCE_MIN) {
    return {
      early: true,
      heading: `Early focus to test: ${shortSkillLabel(nf.skillLabel)}`,
      evidenceLine: `Based on ${nf.responses} marked answer${nf.responses === 1 ? "" : "s"} so far.`,
      explanation:
        "One answer is a signal to test, not a confirmed pattern — practise this skill again to see if it holds.",
    };
  }
  return {
    early: false,
    heading: `Weakest skill: ${shortSkillLabel(nf.skillLabel)}`,
    evidenceLine: null,
    explanation: nf.explanation,
  };
}

// --- Estimate vocabulary (Pilot Trust) --------------------------------------
// Aptly's marks are ALWAYS estimates — only the mark TOTAL (the denominator)
// can be confirmed. Shared student-facing surfaces read these helpers instead
// of hand-writing labels, so bare "confirmed marks" wording (which could imply
// an externally verified IB mark) can never silently reappear.

/** Dashboard microcopy directly on the Economics-level card. */
export const LEVEL_ESTIMATE_DISCLAIMER = "Aptly practice estimate — not an IB grade prediction.";

/** Dashboard stat-card title for topics backed by mark-estimate evidence. */
export const TOPICS_WITH_ESTIMATES_TITLE = "Topics with mark-estimate evidence";

/** Dashboard stat-card caption under the topics count. */
export const TOPICS_WITH_ESTIMATES_CAPTION = "based on confirmed totals";

/** "3 with confirmed totals" — the state-breakdown lead (weekly card). */
export function withConfirmedTotalsLabel(n: number): string {
  return `${n} with confirmed totals`;
}

/** "Based on 4 estimates with confirmed totals" — level-card evidence line. */
export function basedOnEstimatesLabel(n: number): string {
  return `Based on ${n} estimate${n === 1 ? "" : "s"} with confirmed totals`;
}

// --- Practice Loop labels ----------------------------------------------------
// The concise shared vocabulary for revisions and generated practice. Every
// surface reads these constants so the wording can never drift between the
// submission flow, the feedback screen, and the Learning log.

/** List/badge + banner label for a revision attempt. */
export const REVISION_ATTEMPT_LABEL = "Revision attempt";

/** Badge + banner label for an attempt on an Aptly-generated question. */
export const APTLY_PRACTICE_LABEL = "Aptly practice question";

/** One-line provenance note for generated practice. */
export const PRACTICE_FROM_FOCUS_LABEL = "Practice generated from your next focus";

/** The honest non-official disclaimer every generated question carries. */
export const NOT_OFFICIAL_IB_LABEL = "Original Aptly practice, not an official IB question";

/** Neutral confirmation when a revision is not numerically comparable. */
export const REVISION_SAVED_LABEL = "Revision saved";
export const REVISION_SAVED_BODY = "Your revised answer has been added to your learning log.";

/**
 * A compact one-liner for attempt lists (Learning log, Dashboard recent).
 * State-aware via the ONE canonical status helper — never renders a raw score
 * or 0–7 band, so it can never contradict the feedback screen.
 */
export function attemptMetaLine(attempt: Attempt): string {
  const p = markPresentation(attempt);
  const a = attempt.assessment;

  if (p.state === "feedback_only") {
    // No paper label — the model's assessmentFormat must never leak here.
    return a ? `Feedback only · ${a.commandTermLabel}` : "Feedback only";
  }
  if (p.state === "legacy_unscored") {
    return "Earlier attempt";
  }

  const lead = p.state === "provisional" ? `Likely ${p.fraction}` : p.fraction;
  return [lead, a ? frameworkShortLabel(a) : null, a ? a.commandTermLabel : null]
    .filter(Boolean)
    .join(" · ");
}
