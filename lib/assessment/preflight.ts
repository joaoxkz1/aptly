import type { AssessmentFramework, MarkTotalSource, RubricTemplateId } from "@/lib/types";
import { matchTemplate } from "./templates";

/**
 * Deterministic mark-total preflight (Assessment Integrity).
 *
 * Pure, no secrets, no LLM — safe on client and server. Runs BEFORE grading so
 * the first run is clear, and again on the server as the authoritative check.
 * It answers one question: "do we know a reliable mark total, and if not, is
 * there a high-confidence inference to offer the student before we grade?"
 *
 * Product policy (marked vs provisional vs feedback-only) is NOT decided here —
 * that is `resolveScoringPolicy` on the server, which consumes this result plus
 * the student's preflight choice.
 */

// Accept user-confirmed / explicit totals in a sane IB range only.
export const MIN_MARK_TOTAL = 1;
export const MAX_MARK_TOTAL = 60;

export function isValidMarkTotal(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_MARK_TOTAL && n <= MAX_MARK_TOTAL;
}

// --- Explicit mark-total detection ----------------------------------------
// Ordered most-specific first; the first sane match wins. Every pattern
// requires an unambiguous mark cue (brackets, the word "mark(s)", "marker",
// "out of", "maximum of") so ordinary numbers in the prose never match.
const EXPLICIT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\[\s*(\d{1,2})\s*marks?\s*\]/i, label: "[N marks]" },
  { re: /\(\s*(\d{1,2})\s*marks?\s*\)/i, label: "(N marks)" },
  { re: /\bmaximum of\s*(\d{1,2})\s*marks?\b/i, label: "maximum of N marks" },
  { re: /\bout of\s*(\d{1,2})\b/i, label: "out of N" },
  { re: /\b(\d{1,2})\s*[-–]?\s*marker\b/i, label: "N-marker" },
  { re: /\b(\d{1,2})\s*marks?\b/i, label: "N marks" },
  { re: /\[\s*(\d{1,2})\s*\]/, label: "[N]" },
];

export interface ExplicitTotal {
  marks: number;
  matchedText: string;
}

/** The explicit mark total stated in the question text, or null. Code, not LLM. */
export function detectExplicitMarkTotal(question: string): ExplicitTotal | null {
  for (const { re } of EXPLICIT_PATTERNS) {
    const m = question.match(re);
    if (m) {
      const marks = Number.parseInt(m[1], 10);
      if (isValidMarkTotal(marks)) {
        return { marks, matchedText: m[0].trim() };
      }
    }
  }
  return null;
}

// --- Paper 1 part identification ------------------------------------------
// STRICT: only when the pasted question explicitly identifies the part, e.g.
// "Paper 1(a)", "Paper 1 (b)", "Part (a)", "Part (b)". Command-term wording
// ("Explain", "Evaluate", "Discuss") is NEVER sufficient. A Paper 1 part gives
// a HIGH-CONFIDENCE INFERENCE only (provisional), never a confirmed mark.
const PAPER1_A = /\b(?:paper\s*1\s*\(\s*a\s*\)|part\s*\(\s*a\s*\))/i;
const PAPER1_B = /\b(?:paper\s*1\s*\(\s*b\s*\)|part\s*\(\s*b\s*\))/i;

export type Paper1Part = "a" | "b";

export function detectPaper1Part(question: string): Paper1Part | null {
  // (b) checked first so a question naming both parts prefers the higher-tariff part.
  if (PAPER1_B.test(question)) return "b";
  if (PAPER1_A.test(question)) return "a";
  return null;
}

export const PAPER1_PART_MARKS: Record<Paper1Part, number> = { a: 10, b: 15 };

// --- Explicit assessment-framework identification --------------------------
// STRICT: only from an explicit paper-part label. A generic [10]/[15] with no
// label is NEVER silently classified as Paper 1(a/b) / Paper 2(g) / Paper 3(b).
const PAPER2G = /\bpaper\s*2\s*\(\s*g\s*\)/i;
const PAPER3B = /\bpaper\s*3\s*\(\s*b\s*\)/i;

export function detectExplicitFramework(question: string): AssessmentFramework | null {
  // More specific paper labels first.
  if (PAPER2G.test(question)) return "paper2g_15_mark";
  if (PAPER3B.test(question)) return "paper3b_10_mark";
  const part = detectPaper1Part(question);
  if (part === "b") return "paper1b_15_mark";
  if (part === "a") return "paper1a_10_mark";
  return null;
}

/** Framework options offered in the compact choice for an ambiguous total. */
export function frameworkOptionsForTotal(total: number): AssessmentFramework[] {
  if (total === 10) return ["paper1a_10_mark", "paper3b_10_mark", "generic_practice"];
  if (total === 15) return ["paper1b_15_mark", "paper2g_15_mark", "generic_practice"];
  return [];
}

// --- Combined preflight ----------------------------------------------------

export type PreflightKind = "explicit" | "inference" | "unknown";

export interface PreflightResult {
  kind: PreflightKind;
  /** Known (explicit) or inferred (high-confidence) denominator; null if unknown. */
  total: number | null;
  /** How the total was arrived at. "user_confirmed" is only ever set later. */
  source: Extract<MarkTotalSource, "explicit" | "template_inferred" | "unknown">;
  templateId: RubricTemplateId | null;
  paperPart: Paper1Part | null;
  matchedText: string | null;
  /** Short human hint for the compact preflight UI. */
  hint: string | null;
  /** Best server guess at the IB marking framework. */
  framework: AssessmentFramework;
  /** True when the framework is safe to use without asking the student. */
  frameworkConfirmed: boolean;
  /** Options to offer when the framework is not confirmed (ambiguous 10/15). */
  frameworkOptions: AssessmentFramework[];
}

/**
 * Single preflight pass. Priority: an explicit total in the text always wins;
 * otherwise a high-confidence inference (recognised diagram template, then a
 * Paper 1 part label); otherwise unknown.
 */
export function runPreflight(question: string): PreflightResult {
  const explicit = detectExplicitMarkTotal(question);
  const template = matchTemplate(question);
  const part = detectPaper1Part(question);
  const explicitFramework = detectExplicitFramework(question);

  if (explicit !== null) {
    const total = explicit.marks;
    // Framework precedence: recognised diagram template, then an explicit paper
    // label, then a recognised 2-mark short response; otherwise a 10/15 total
    // with no label must be CONFIRMED by the student before claiming a paper.
    let framework: AssessmentFramework;
    let frameworkConfirmed = true;
    let frameworkOptions: AssessmentFramework[] = [];
    if (template !== null && total === template.totalMarks) {
      framework = "paper2_four_mark_diagram_explain";
    } else if (explicitFramework !== null) {
      framework = explicitFramework;
    } else if (total <= 2) {
      framework = "paper2_short_analytic";
    } else if (total === 10 || total === 15) {
      framework = "generic_practice";
      frameworkConfirmed = false;
      frameworkOptions = frameworkOptionsForTotal(total);
    } else {
      framework = "generic_practice";
    }
    return {
      kind: "explicit",
      total,
      source: "explicit",
      // Keep the template id so its diagram cap can still apply to an explicit total.
      templateId: template?.id ?? null,
      paperPart: null,
      matchedText: explicit.matchedText,
      hint: null,
      framework,
      frameworkConfirmed,
      frameworkOptions,
    };
  }

  if (template !== null) {
    return {
      kind: "inference",
      total: template.totalMarks,
      source: "template_inferred",
      templateId: template.id,
      paperPart: null,
      matchedText: null,
      hint: `This looks like a likely ${template.totalMarks}-mark diagram question.`,
      framework: "paper2_four_mark_diagram_explain",
      frameworkConfirmed: true,
      frameworkOptions: [],
    };
  }

  if (part !== null) {
    const total = PAPER1_PART_MARKS[part];
    return {
      kind: "inference",
      total,
      source: "template_inferred",
      templateId: null,
      paperPart: part,
      matchedText: null,
      hint: `This looks like a likely Paper 1(${part}) — around ${total} marks.`,
      framework: part === "a" ? "paper1a_10_mark" : "paper1b_15_mark",
      frameworkConfirmed: true,
      frameworkOptions: [],
    };
  }

  return {
    kind: "unknown",
    total: null,
    source: "unknown",
    templateId: null,
    paperPart: null,
    matchedText: null,
    hint: null,
    framework: "generic_practice",
    frameworkConfirmed: true,
    frameworkOptions: [],
  };
}
