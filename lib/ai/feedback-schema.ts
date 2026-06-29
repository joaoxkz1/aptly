import "server-only";
import { MISTAKE_TYPES, type Feedback, type MistakeType, type Subject } from "@/lib/types";

/**
 * Strict JSON schema + fixed instructions + server-side validation for the
 * grader. The schema is built from MISTAKE_TYPES so it can never drift from
 * the app's enum. `band` is intentionally NOT in the schema — it is computed
 * server-side from `score` so the two are always consistent.
 */

const BAND_NAMES: Record<number, string> = {
  7: "Excellent 7",
  6: "Strong 6",
  5: "Secure 5",
  4: "Developing 4",
  3: "Limited 3",
  2: "Fragmentary 2",
  1: "Minimal 1",
  0: "Minimal 0",
};

export function bandForScore(score: number): string {
  const s = Math.min(7, Math.max(0, Math.round(score)));
  return BAND_NAMES[s] ?? `Band ${s}`;
}

// Strict Structured Outputs schema. Only a subset of JSON Schema is allowed in
// strict mode (no min/max/minItems), so numeric/length limits are enforced in
// validateFeedback below.
export const FEEDBACK_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["score", "strengths", "improvements", "mistakes", "examinerComment", "studyNext"],
  properties: {
    score: { type: "integer", description: "Estimated IB-style mark from 0 to 7." },
    strengths: {
      type: "array",
      description: "1-3 concise, specific strengths of the answer.",
      items: { type: "string" },
    },
    improvements: {
      type: "array",
      description: "1-3 concise, specific, actionable improvements.",
      items: { type: "string" },
    },
    mistakes: {
      type: "array",
      description: "0-3 weakness labels chosen ONLY from the fixed list.",
      items: { type: "string", enum: [...MISTAKE_TYPES] },
    },
    examinerComment: {
      type: "string",
      description: "One short examiner-style paragraph specific to this answer.",
    },
    studyNext: {
      type: "string",
      description: "One sentence on what to study or practise next.",
    },
  },
};

export function buildInstructions(): string {
  return [
    "You are Aptly, an IB Economics study assistant that gives ESTIMATED study feedback for practice.",
    "This is NOT official IB grading and you must never claim it is.",
    "Grade the student's answer strictly against the provided Aptly Economics rubric and the question's command term.",
    "Base every comment on the student's actual text — do not invent content they did not write.",
    "Use only the fixed mistake labels from the rubric. Keep strengths/improvements to at most 3 each, concise and specific.",
    "Return only the structured JSON defined by the response format. Do not add extra commentary.",
  ].join(" ");
}

export function buildUserInput(
  subject: Subject,
  topic: string,
  question: string,
  answer: string,
  rubric: string
): string {
  return [
    "APTLY ECONOMICS RUBRIC:",
    rubric,
    "",
    `SUBJECT: ${subject}`,
    `TOPIC: ${topic}`,
    "",
    "QUESTION:",
    question,
    "",
    "STUDENT ANSWER:",
    answer,
    "",
    "Produce estimated study feedback as the required JSON.",
  ].join("\n");
}

function asNonEmptyStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, max);
}

/**
 * Validates the model output and returns a complete Feedback object.
 * Throws on anything incomplete/invalid so the route can fail closed —
 * an invalid grade must never be returned or saved.
 */
export function validateFeedback(raw: unknown): Feedback {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("invalid feedback: not an object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.score !== "number" || !Number.isFinite(obj.score)) {
    throw new Error("invalid feedback: score");
  }
  const score = Math.min(7, Math.max(0, Math.round(obj.score)));

  const examinerComment =
    typeof obj.examinerComment === "string" ? obj.examinerComment.trim() : "";
  const studyNext = typeof obj.studyNext === "string" ? obj.studyNext.trim() : "";
  if (examinerComment === "" || studyNext === "") {
    throw new Error("invalid feedback: empty comment/studyNext");
  }

  const strengths = asNonEmptyStrings(obj.strengths, 3);
  const improvements = asNonEmptyStrings(obj.improvements, 3);
  if (strengths.length === 0 && improvements.length === 0) {
    throw new Error("invalid feedback: no strengths or improvements");
  }

  const allowed = new Set<string>(MISTAKE_TYPES);
  const mistakes = Array.isArray(obj.mistakes)
    ? [...new Set(obj.mistakes.filter((m): m is MistakeType => typeof m === "string" && allowed.has(m)))].slice(0, 3)
    : [];

  return {
    score,
    band: bandForScore(score),
    strengths,
    improvements,
    mistakes,
    examinerComment,
    studyNext,
  };
}
