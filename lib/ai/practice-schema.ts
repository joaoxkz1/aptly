import "server-only";
import { detectMarkTotals } from "@/lib/assessment/preflight";
import { matchTemplate } from "@/lib/assessment/templates";
import { hasUsableSourceMaterial } from "@/lib/assessment/policy";
import { ASSESSMENT_SKILL_LABELS, SYLLABUS_TOPIC_LABELS } from "@/lib/assessment/taxonomy";
import { MAX_QUESTION_CHARS } from "./config";
import type { PracticeTarget } from "@/lib/assessment/practice-target";

/**
 * Practice Loop — structured-output schema + instructions + fail-closed
 * validation for GENERATED practice questions.
 *
 * Trust model: the SERVER derives the target (topic, skill, framework, mark
 * total) from the canonical next focus; the model only WRITES an original
 * question (and, for Paper 2(g)/3(b), an original text stimulus) inside that
 * frame. Every generated question is validated deterministically before it is
 * stored or shown — anything off-frame throws and the route fails closed.
 */

export const PRACTICE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["question", "sourceMaterial"],
  properties: {
    question: {
      type: "string",
      description:
        "One original practice question ending with its mark total in brackets, e.g. “… [10 marks]”.",
    },
    sourceMaterial: {
      type: ["string", "null"],
      description:
        "Original text stimulus for a data-response task; null when the framework needs no source.",
    },
  },
};

const FRAMEWORK_BRIEF: Record<PracticeTarget["framework"], string> = {
  paper2_short_analytic:
    "A short 2-mark task: one precise definition or one short analytic statement/calculation solvable without any data set, diagram, or source.",
  paper1a_10_mark:
    "A Paper 1(a)-style 10-mark explanation task: 'Explain …' wording, testing accurate theory and coherent analysis. No evaluation demanded, no source text.",
  paper1b_15_mark:
    "A Paper 1(b)-style 15-mark extended-response task: 'Discuss…' / 'Evaluate…' / 'To what extent…' wording demanding real-world application, balanced evaluation, and a supported judgement. No source text.",
  paper2g_15_mark:
    "A Paper 2(g)-style 15-mark data-response task: 'Using information from the text and your knowledge of economics, discuss/evaluate …'. It MUST be answerable from the sourceMaterial you write.",
  paper3b_10_mark:
    "A Paper 3(b)-style 10-mark policy recommendation: 'Using information from the text, recommend a policy …'. It MUST be answerable from the sourceMaterial you write.",
  generic_practice:
    "A realistic practice question for the stated mark total, testing the stated skill. Do not phrase it as belonging to any specific IB paper.",
};

export function buildPracticeInstructions(): string {
  return [
    "You are Aptly, writing ONE original IB-Economics-style practice question for a student.",
    "The question must be entirely your own original writing — never a real past-paper question, never copied or closely paraphrased from any published source, and never presented as official IB material.",
    "Never mention the IB, an exam board, a paper number, a year, or an official markscheme in the question or source.",
    "The question must be answerable in writing alone: never ask the student to draw, sketch, label, or refer to any diagram, graph, chart, table, or figure, and never rely on information that is not supplied in the question or source text.",
    "End the question with its exact mark total in square brackets, e.g. [10 marks]. State no other bracketed numbers.",
    "When a source is required: write a short ORIGINAL stimulus (about 120–220 words) about a plausible fictional or realistically described economy/market, containing specific usable economic information — at least three concrete figures (percentages, prices, quantities, or dates) plus clear trends, claims, or trade-offs a student can apply. Prose only: no tables, charts, or bullet lists.",
    "When no source is required, sourceMaterial must be null and the question must be fully self-contained.",
    "Use natural IB-style command wording appropriate to the task and keep the question aligned to exactly the ONE topic and ONE skill given.",
    "Return only the structured JSON defined by the response format.",
  ].join(" ");
}

export function buildPracticeUserInput(target: PracticeTarget): string {
  const topicName =
    SYLLABUS_TOPIC_LABELS[target.topicCode as keyof typeof SYLLABUS_TOPIC_LABELS] ??
    target.topicLabel;
  return [
    "PRACTICE FRAME (decided by Aptly — write inside it exactly):",
    `Syllabus topic: ${topicName} (IB Economics topic ${target.topicCode})`,
    `Skill being practised: ${ASSESSMENT_SKILL_LABELS[target.skill]}`,
    `Task style: ${FRAMEWORK_BRIEF[target.framework]}`,
    `Mark total: ${target.markTotal} — the question must end with “[${target.markTotal} marks]”.`,
    `Source material required: ${target.requiresSource ? "YES — write the original stimulus" : "NO — sourceMaterial must be null"}.`,
    "Produce the structured JSON.",
  ].join("\n");
}

// --- Fail-closed validation --------------------------------------------------

function fail(msg: string): never {
  throw new Error(`invalid generated practice: ${msg}`);
}

// Any reliance on visual/attached material makes a task Aptly cannot assess
// fully this release — reject the whole generation (the student can retry).
const VISUAL_RELIANCE =
  /\b(diagrams?|graphs?|charts?|tables?|figures?|sketch|axes|draw|plot|illustrations?|images?|pictures?|attach(?:ed|ment)?|shown below)\b/i;

// A generated question must never claim (or appear to claim) official status.
const OFFICIAL_CLAIM =
  /\b(official|past[\s-]paper|exam board|markscheme|\bIB\b|paper\s*[123]|baccalaureate)\b/i;

const MIN_QUESTION_WORDS = 6;
const MIN_SOURCE_WORDS = 80;
const MAX_SOURCE_WORDS = 400;
/** Specific usable figures a student can apply (digits in the stimulus). */
const MIN_SOURCE_FIGURES = 2;

function wordCount(s: string): number {
  const t = s.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

export interface GeneratedPractice {
  question: string;
  sourceMaterial: string | null;
}

/**
 * Deterministic, fail-closed validation of the model's generated question
 * against the server-derived target. Guarantees, before anything is stored or
 * shown: an explicit single mark total matching the frame, no diagram/visual
 * reliance, no official-IB claim, no accidental 4-mark-template match, and —
 * for source frameworks — an original stimulus with genuinely usable content.
 */
export function validateGeneratedPractice(raw: unknown, target: PracticeTarget): GeneratedPractice {
  if (typeof raw !== "object" || raw === null) return fail("not an object");
  const o = raw as Record<string, unknown>;

  if (typeof o.question !== "string") return fail("question");
  const question = o.question.trim();
  if (question === "") return fail("question empty");
  if (question.length > MAX_QUESTION_CHARS) return fail("question too long");
  if (wordCount(question) < MIN_QUESTION_WORDS) return fail("question too short");

  // The mark total must be explicit, singular, and exactly the server frame —
  // the same detector the grading preflight trusts.
  const detection = detectMarkTotals(question);
  if (detection.kind !== "single" || detection.single?.marks !== target.markTotal) {
    return fail("mark total not explicit and unambiguous");
  }

  if (VISUAL_RELIANCE.test(question)) return fail("question relies on visual material");
  if (OFFICIAL_CLAIM.test(question)) return fail("question claims official status");
  // Defence in depth: a generated question must never match the 4-mark
  // diagram-explain template (no diagram tasks until upload exists).
  if (matchTemplate(question) !== null) return fail("question matches diagram template");

  let sourceMaterial: string | null = null;
  if (target.requiresSource) {
    if (typeof o.sourceMaterial !== "string") return fail("source required");
    const source = o.sourceMaterial.trim();
    if (!hasUsableSourceMaterial(source)) return fail("source unusable");
    const words = wordCount(source);
    if (words < MIN_SOURCE_WORDS || words > MAX_SOURCE_WORDS) return fail("source length");
    const figures = source.match(/\d[\d,.]*/g) ?? [];
    if (figures.length < MIN_SOURCE_FIGURES) return fail("source lacks usable figures");
    if (OFFICIAL_CLAIM.test(source)) return fail("source claims official status");
    if (source.length > MAX_QUESTION_CHARS) return fail("source too long");
    sourceMaterial = source;
  }
  // Non-source frameworks: any stray model-proposed source is dropped, never stored.

  return { question, sourceMaterial };
}
