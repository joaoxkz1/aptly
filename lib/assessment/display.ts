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

// --- UI-only short labels (headings / compact cards) -----------------------
// These NEVER feed grouping, analytics, thresholds, or recommendation logic —
// those keep using the canonical topicCode / topicLabel. Pure display shortening.

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
 * A compact, Title-Cased topic label for headings and dense rows. Drops
 * parenthetical detail and keeps the head of the canonical free-text label.
 * Display only — the full `topicLabel` stays available for tooltips/detail.
 */
export function shortTopicLabel(topicLabel: string): string {
  const head = topicLabel
    .replace(/\([^)]*\)/g, " ") // remove "(demerit goods …)" detail
    .split(/[/,:;·|]/)[0] // keep the head before a separator
    .replace(/\s+/g, " ")
    .trim();
  const base = head === "" ? topicLabel.trim() : head;
  const minor = new Set(["and", "of", "the", "to", "in", "for", "a", "an"]);
  return base
    .split(" ")
    .slice(0, 4) // soft length cap so a heading never sprawls
    .map((w, i) =>
      i > 0 && minor.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

/** "Evaluation in Market Failure" — skill + short topic, display only. */
export function shortNextFocusHeadline(skillLabel: string, topicLabel: string): string {
  return `${shortSkillLabel(skillLabel)} in ${shortTopicLabel(topicLabel)}`;
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
