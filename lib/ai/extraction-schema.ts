import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS } from "./config";
import { hasUsableSourceMaterial } from "@/lib/assessment/policy";

/**
 * Aptly Scan extraction contract (image → candidate editable text).
 *
 * Pure, no secrets — safe to unit-test. The vision model has exactly ONE job:
 * transcribe visible readable content into three nullable candidate text
 * fields. It never marks, never classifies a paper/framework, never decides
 * whether an answer is correct, and never invents text. Everything
 * mark-related (framework detection, totals, source gating, eligibility)
 * continues to come from the student-REVIEWED text through the existing
 * deterministic server pipeline — the extraction output is a draft the
 * student edits, nothing more.
 */

export interface ExtractedFields {
  question: string | null;
  answer: string | null;
  sourceMaterial: string | null;
}

/** Strict structured-output schema: the three transcription fields, nothing else. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "answer", "sourceMaterial"],
  properties: {
    question: {
      type: ["string", "null"],
      description:
        "Verbatim transcription of the printed or handwritten QUESTION text visible in the image, including any visible mark total exactly as written (e.g. \"[15]\"). null when no question text is visible.",
    },
    answer: {
      type: ["string", "null"],
      description:
        "Verbatim transcription of the student's ANSWER (usually handwritten) visible in the image. null when no answer text is visible.",
    },
    sourceMaterial: {
      type: ["string", "null"],
      description:
        "Verbatim transcription of any SOURCE / stimulus passage or data visible in the image (the text an exam question refers to). null when no readable source text is visible.",
    },
  },
} as const;

/** Developer instructions: transcription only — no judgement, no invention. */
export function buildExtractionInstructions(): string {
  return [
    "You transcribe a single photographed or scanned page of Economics exam work into text fields. Transcription is your ONLY job.",
    "",
    "Rules:",
    "- Transcribe only text you can actually read in the image. Never guess, infer, or invent missing words; skip what you cannot read.",
    "- Copy the student's answer EXACTLY as written — preserve their wording, errors, figures, units, currency symbols, and labels. Never rewrite, improve, summarise, correct, or complete it.",
    "- Preserve line breaks and paragraph breaks where they help readability.",
    "- question: the exam question text, including any visible mark total exactly as printed (e.g. \"[15 marks]\"). Do not add a mark total that is not visible.",
    "- answer: the student's own response.",
    "- sourceMaterial: a source/stimulus passage or data extract the question refers to, only when its text is actually readable. A chart, table, or graph with no readable prose or data values is NOT source material — return null for it.",
    "- A hand-drawn diagram is not text: do not describe it, do not transcribe it, and do not mention it in any field. Transcribe only the written words around it.",
    "- Do not transcribe page furniture that is not part of the question, source, or answer: student names, candidate numbers, dates, teacher names, page numbers, or margin doodles.",
    "- Do not classify the paper, question type, or subject. Do not judge correctness. Do not add marks, feedback, comments, or labels of your own.",
    "- Use null for any field with no readable content of that kind. If nothing on the page is readable, return null for all three fields.",
  ].join("\n");
}

/** The user-turn text accompanying the image. */
export function buildExtractionUserText(): string {
  return "Transcribe the visible content of this page into the question, answer, and sourceMaterial fields. Return null for anything not present or not readable.";
}

function normalizeField(value: string | null, maxChars: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  // Grading rejects over-limit text anyway; clamp so a filled field is usable.
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
}

/**
 * Fail-closed validation of the model's extraction output.
 *
 * Accepts ONLY an object with exactly the three approved transcription fields,
 * each a string or null. Any unexpected field — marks, framework or Paper
 * labels, grading comments, confidence scores, or other metadata — rejects
 * the whole output (throws; the route returns a generic safe failure). Error
 * messages are code-authored constants naming the failing field, never model
 * output or student text.
 *
 * Normalisation: fields are trimmed, empty strings become null, over-limit
 * text is clamped to the grading field caps, and a sourceMaterial that fails
 * the existing usable-source check (too short to be real stimulus text) is
 * nulled so a bare caption can never masquerade as source material.
 */
export function validateExtractionResult(parsed: unknown): ExtractedFields {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid extraction result: shape");
  }
  const record = parsed as Record<string, unknown>;
  const allowed = ["question", "answer", "sourceMaterial"];
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new Error("invalid extraction result: unexpected field");
    }
  }
  for (const key of allowed) {
    if (!(key in record)) {
      throw new Error(`invalid extraction result: ${key}`);
    }
    const value = record[key];
    if (value !== null && typeof value !== "string") {
      throw new Error(`invalid extraction result: ${key}`);
    }
  }

  const question = normalizeField(record.question as string | null, MAX_QUESTION_CHARS);
  const answer = normalizeField(record.answer as string | null, MAX_ANSWER_CHARS);
  let sourceMaterial = normalizeField(record.sourceMaterial as string | null, MAX_QUESTION_CHARS);
  // The existing source gate's floor: a fragment that could never count as
  // usable source text is not offered as one.
  if (sourceMaterial !== null && !hasUsableSourceMaterial(sourceMaterial)) {
    sourceMaterial = null;
  }

  return { question, answer, sourceMaterial };
}

/** True when the extraction produced at least one usable candidate field. */
export function hasExtractedContent(fields: ExtractedFields): boolean {
  return fields.question !== null || fields.answer !== null || fields.sourceMaterial !== null;
}
