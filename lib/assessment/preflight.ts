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

// --- Mark-total grammar ------------------------------------------------------
// ONE authoritative parser for every common copied IB mark format, shared by
// the client preflight, the server policy revalidation, and the tests.
//
// Recognised formats (ASCII digits, values 1–60):
//   [4 marks] (4 marks) {4 marks} ［4 marks］ （4 marks） [4 mark] (4 mark)
//   [4] (4) {4} ［4］ （4）           ← bare brackets, confidence-classified
//   4 marks · 4 mark · 4-marker · 4 marker
//   out of 4 · maximum of 4 marks · maximum 4 marks · worth 4 marks

const BRACKET_PAIRS: readonly [string, string][] = [
  ["\\[", "\\]"],
  ["\\(", "\\)"],
  ["\\{", "\\}"],
  ["［", "］"], // full-width variants seen in copied PDFs
  ["（", "）"],
];

// Worded cues — always high confidence (ordinary prose numbers never match).
const WORDED_PATTERNS: readonly RegExp[] = [
  ...BRACKET_PAIRS.map(
    ([open, close]) => new RegExp(`${open}\\s*(\\d{1,2})\\s*marks?\\s*${close}`, "gi")
  ),
  /\bmaximum\s+(?:of\s+)?(\d{1,2})\s*marks?\b/gi,
  /\bworth\s+(\d{1,2})\s*marks?\b/gi,
  /\bout\s+of\s+(\d{1,2})\b/gi,
  /\b(\d{1,2})\s*[-–]?\s*markers?\b/gi,
  /\b(\d{1,2})\s*marks?\b/gi,
];

// Bare bracketed numbers — common copied-mark shorthand, but may be citations.
const BARE_BRACKET_PATTERNS: readonly RegExp[] = BRACKET_PAIRS.map(
  ([open, close]) => new RegExp(`${open}\\s*(\\d{1,2})\\s*${close}`, "g")
);

export interface ExplicitTotal {
  marks: number;
  matchedText: string;
  /**
   * The question slice this total most plausibly belongs to (from the end of
   * the previous detected total to this one) — used so a SELECTED part of a
   * multi-part paste, not the whole paste, feeds template detection/grading.
   */
  partText: string;
}

type CandidateConfidence = "high" | "low";

interface RawCandidate {
  marks: number;
  matchedText: string;
  index: number;
  end: number;
  confidence: CandidateConfidence;
}

// Only whitespace/punctuation after the bracket to end-of-line → the bracket
// closes a question line or labelled subpart (the classic copied-mark spot).
const TERMINAL_AFTER = /^[\s.,:;!?]*$/;

/**
 * Conservative confidence for a bare bracketed number: high only when it sits
 * at the end of a line/sentence/subpart or immediately after a question;
 * low when embedded in prose (probably a citation or reference).
 */
function bareBracketConfidence(question: string, index: number, end: number): CandidateConfidence {
  const lineEnd = question.indexOf("\n", end);
  const restOfLine = question.slice(end, lineEnd === -1 ? question.length : lineEnd);
  if (TERMINAL_AFTER.test(restOfLine)) return "high";
  const before = question.slice(0, index).trimEnd();
  if (/[.?!]$/.test(before)) return "high";
  return "low";
}

function collectCandidates(question: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const re of WORDED_PATTERNS) {
    for (const m of question.matchAll(re)) {
      const marks = Number.parseInt(m[1], 10);
      if (!isValidMarkTotal(marks)) continue;
      const index = m.index ?? 0;
      out.push({
        marks,
        matchedText: m[0].trim(),
        index,
        end: index + m[0].length,
        confidence: "high",
      });
    }
  }
  for (const re of BARE_BRACKET_PATTERNS) {
    for (const m of question.matchAll(re)) {
      const marks = Number.parseInt(m[1], 10);
      if (!isValidMarkTotal(marks)) continue;
      const index = m.index ?? 0;
      const end = index + m[0].length;
      out.push({
        marks,
        matchedText: m[0].trim(),
        index,
        end,
        confidence: bareBracketConfidence(question, index, end),
      });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** One entry per DISTINCT value; a worded/terminal match beats a prose bracket. */
function dedupeByValue(candidates: RawCandidate[]): RawCandidate[] {
  const byValue = new Map<number, RawCandidate>();
  for (const c of candidates) {
    const cur = byValue.get(c.marks);
    if (cur == null || (cur.confidence === "low" && c.confidence === "high")) {
      byValue.set(c.marks, c);
    }
  }
  return [...byValue.values()].sort((a, b) => a.index - b.index);
}

function withPartText(question: string, candidates: RawCandidate[]): ExplicitTotal[] {
  let prevEnd = 0;
  return candidates.map((c) => {
    const partText = question.slice(prevEnd, c.end).trim();
    prevEnd = c.end;
    return { marks: c.marks, matchedText: c.matchedText, partText };
  });
}

export type MarkTotalDetectionKind = "none" | "single" | "uncertain" | "multiple";

export interface MarkTotalDetection {
  kind: MarkTotalDetectionKind;
  /** The ONE trustworthy total (kind "single" only). */
  single: ExplicitTotal | null;
  /** Every distinct candidate offered to the student (ordered by position). */
  candidates: ExplicitTotal[];
}

/**
 * The authoritative detection decision:
 *  - "single":    exactly one distinct high-confidence total → safe to use.
 *                 (Lower-confidence bare brackets with other values are treated
 *                 as citations and dropped — never silently marked from.)
 *  - "multiple":  two or more distinct trustworthy totals → the student must
 *                 consciously choose one (never the first, never a sum).
 *  - "uncertain": only prose-embedded bare bracket(s) → confirmation required.
 *  - "none":      no candidate at all.
 */
export function detectMarkTotals(question: string): MarkTotalDetection {
  const all = dedupeByValue(collectCandidates(question));
  if (all.length === 0) return { kind: "none", single: null, candidates: [] };

  const high = all.filter((c) => c.confidence === "high");
  if (high.length === 1) {
    const [single] = withPartText(question, high);
    return { kind: "single", single, candidates: [single] };
  }
  if (high.length >= 2) {
    return { kind: "multiple", single: null, candidates: withPartText(question, high) };
  }
  const candidates = withPartText(question, all);
  return all.length === 1
    ? { kind: "uncertain", single: null, candidates }
    : { kind: "multiple", single: null, candidates };
}

/** The single trustworthy explicit total, or null. Code, not LLM. */
export function detectExplicitMarkTotal(question: string): ExplicitTotal | null {
  const d = detectMarkTotals(question);
  return d.kind === "single" ? d.single : null;
}

/** Every distinct detected total (any confidence), ordered by appearance. */
export function detectExplicitMarkTotals(question: string): ExplicitTotal[] {
  return detectMarkTotals(question).candidates;
}

// --- Paper 1 part identification ------------------------------------------
// STRICT: a bare "Part (a)/(b)" is NOT Paper 1 evidence on its own — Paper 2
// and Paper 3 label subparts the same way. The Paper 1 frameworks require an
// explicit "Paper 1(a)"/"Paper 1 (b)" label, or a part label together with
// explicit Paper 1 context in the paste. Command-term wording is NEVER enough.
// A Paper 1 part gives a HIGH-CONFIDENCE INFERENCE only, never a confirmed mark.
const PAPER1_CONTEXT = /\bpaper\s*1\b/i;
const PAPER1_A = /\b(?:paper\s*1\s*\(\s*a\s*\)|part\s*\(\s*a\s*\))/i;
const PAPER1_B = /\b(?:paper\s*1\s*\(\s*b\s*\)|part\s*\(\s*b\s*\))/i;

export type Paper1Part = "a" | "b";

export function detectPaper1Part(question: string): Paper1Part | null {
  if (!PAPER1_CONTEXT.test(question)) return null;
  // (b) checked first so a question naming both parts prefers the higher-tariff part.
  if (PAPER1_B.test(question)) return "b";
  if (PAPER1_A.test(question)) return "a";
  return null;
}

export const PAPER1_PART_MARKS: Record<Paper1Part, number> = { a: 10, b: 15 };

// --- Explicit assessment-framework identification --------------------------
// STRICT: only from an explicit paper-part label. A generic [10]/[15] with no
// label is NEVER silently classified as an official paper framework. An
// explicit paper label always beats structural template recognition, so e.g.
// a Paper 3(a) 4-mark explain never inherits the Paper 2(c)–(f) 2+2 template.
const PAPER2G = /\bpaper\s*2\s*\(\s*g\s*\)/i;
const PAPER3B = /\bpaper\s*3\s*\(\s*b\s*\)/i;
const PAPER2A = /\bpaper\s*2\s*\(\s*a\s*\)/i;
const PAPER2B = /\bpaper\s*2\s*\(\s*b\s*\)/i;
const PAPER3A = /\bpaper\s*3\s*\(\s*a\s*\)/i;

export function detectExplicitFramework(question: string): AssessmentFramework | null {
  // More specific paper labels first.
  if (PAPER2G.test(question)) return "paper2g_15_mark";
  if (PAPER3B.test(question)) return "paper3b_10_mark";
  if (PAPER2A.test(question)) return "paper2a_definition";
  if (PAPER2B.test(question)) return "paper2b_quantitative";
  if (PAPER3A.test(question)) return "paper3a_analytic";
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

export type PreflightKind =
  | "explicit"
  | "inference"
  | "unknown"
  | "multiple_explicit"
  | "uncertain_total";

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
  /**
   * Every distinct detected total with its wording and question-part slice.
   * One entry for "explicit"/"uncertain_total"; two or more only for
   * "multiple_explicit", where the student must consciously choose.
   */
  explicitTotals: ExplicitTotal[];
}

/**
 * Single preflight pass. Priority: a single trustworthy explicit total in the
 * text wins; two or more DISTINCT totals (or a prose-embedded bare bracket)
 * are an ambiguity the student must resolve — never auto-pick, never sum;
 * otherwise a high-confidence inference (recognised diagram template, then an
 * explicit Paper 1 part label); otherwise unknown.
 */
export function runPreflight(question: string): PreflightResult {
  const detection = detectMarkTotals(question);
  const template = matchTemplate(question);
  const part = detectPaper1Part(question);
  const explicitFramework = detectExplicitFramework(question);

  if (detection.kind === "multiple") {
    return {
      kind: "multiple_explicit",
      total: null,
      source: "unknown",
      templateId: null,
      paperPart: null,
      matchedText: null,
      hint: null,
      framework: "generic_practice",
      frameworkConfirmed: true,
      frameworkOptions: [],
      explicitTotals: detection.candidates,
    };
  }

  if (detection.kind === "uncertain") {
    const candidate = detection.candidates[0];
    return {
      kind: "uncertain_total",
      total: null,
      source: "unknown",
      templateId: null,
      paperPart: null,
      matchedText: candidate.matchedText,
      hint: `Aptly found “${candidate.matchedText}” — it may be a mark total or just a reference.`,
      framework: "generic_practice",
      frameworkConfirmed: true,
      frameworkOptions: [],
      explicitTotals: detection.candidates,
    };
  }

  if (detection.kind === "single") {
    const explicit = detection.single!;
    const total = explicit.marks;
    // Framework precedence: an explicit paper label ALWAYS beats structural
    // template recognition; then the recognised diagram template; then a
    // recognised short response; otherwise a 10/15 total with no label must be
    // CONFIRMED by the student before claiming a paper.
    let framework: AssessmentFramework;
    let frameworkConfirmed = true;
    let frameworkOptions: AssessmentFramework[] = [];
    if (explicitFramework !== null) {
      framework = explicitFramework;
    } else if (template !== null && total === template.totalMarks) {
      framework = "paper2_four_mark_diagram_explain";
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
      // Template id kept ONLY when the template framework actually applies —
      // an explicit paper label (e.g. Paper 3(a)) must not inherit the cap.
      templateId: framework === "paper2_four_mark_diagram_explain" ? (template?.id ?? null) : null,
      paperPart: null,
      matchedText: explicit.matchedText,
      hint: null,
      framework,
      frameworkConfirmed,
      frameworkOptions,
      explicitTotals: detection.candidates,
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
      explicitTotals: [],
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
      explicitTotals: [],
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
    explicitTotals: [],
  };
}
