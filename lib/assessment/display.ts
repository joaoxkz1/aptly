import type { Assessment, Confidence } from "@/lib/types";
import { ASSESSMENT_FORMAT_LABELS } from "./taxonomy";

/** Display helpers for assessment attempts (shared, no secret). */

export function formatLabel(a: Assessment): string {
  return ASSESSMENT_FORMAT_LABELS[a.assessmentFormat] ?? "Unclassified";
}

export function confidenceLabel(c: Confidence): string {
  return c === "high" ? "High" : c === "medium" ? "Medium" : "Low";
}

/** "Paper 1 (b) · Discuss" — format then the free-text command label. */
export function formatAndCommand(a: Assessment): string {
  return `${formatLabel(a)} · ${a.commandTermLabel}`;
}

/** "≈5–6" (or "≈5" when the band is a single value). */
export function practiceBandLabel(a: Assessment): string {
  return a.practiceLevelLow === a.practiceLevelHigh
    ? `≈${a.practiceLevelLow}`
    : `≈${a.practiceLevelLow}–${a.practiceLevelHigh}`;
}

/** The mark fraction, e.g. "10/15". Denominator is ALWAYS marksAssessable. */
export function markFraction(a: Assessment): string | null {
  if (a.marksEarned == null || a.marksAssessable == null) return null;
  return `${a.marksEarned}/${a.marksAssessable}`;
}

/** Short reason shown when no overall mark is given. */
export function practiceOnlyReason(a: Assessment): string {
  if (a.diagramExpected && !a.diagramSubmitted) {
    return "Diagram not supplied — overall mark not estimated.";
  }
  if (a.marksSource === "not_reliably_known") {
    return "Aptly could not confidently identify the mark allocation, so no overall mark is estimated.";
  }
  return "The mark allocation could not be confidently determined, so no overall mark is estimated.";
}

/** A compact one-liner for the attempts list. */
export function attemptMetaLine(a: Assessment): string {
  if (a.markDisplayMode === "practice_feedback_only") {
    return "Practice feedback · Mark total not confidently detected";
  }
  const frac = markFraction(a);
  return [frac, formatLabel(a), a.commandTermLabel, practiceBandLabel(a)]
    .filter(Boolean)
    .join(" · ");
}
