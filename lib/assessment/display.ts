import type { Assessment, AssessmentMarkBreakdownItem, Attempt, Confidence } from "@/lib/types";
import {
  ASSESSMENT_FORMAT_LABELS,
  ASSESSMENT_FRAMEWORK_LABELS,
  SYLLABUS_TOPIC_LABELS,
  SYLLABUS_TOPIC_SHORT_LABELS,
} from "./taxonomy";
import { markPresentation } from "./status";

/** Display helpers for assessment attempts (shared, no secret). */

export function formatLabel(a: Assessment): string {
  return ASSESSMENT_FORMAT_LABELS[a.assessmentFormat] ?? "Unclassified";
}

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
    // Legacy attempt (no framework) — keep the old format · command line.
    return { label: formatAndCommand(a), note: null };
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

/** Card-level note when a saved attempt expected but lacked a diagram. */
export function diagramEvidenceNote(count: number): { title: string; body: string } {
  return {
    title: "Diagram evidence unavailable",
    body: `Aptly assessed related written explanation in ${count} answer${count === 1 ? "" : "s"}, but no diagram itself has been assessed.`,
  };
}

export function confidenceLabel(c: Confidence): string {
  return c === "high" ? "High" : c === "medium" ? "Medium" : "Low";
}

/** "Paper 1 (b) · Discuss" — format then the free-text command label. */
export function formatAndCommand(a: Assessment): string {
  return `${formatLabel(a)} · ${a.commandTermLabel}`;
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
