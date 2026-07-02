import type { Subject } from "@/lib/types";

/**
 * Single source of truth for the AI grading config.
 * Change the model here once to switch providers/models later — it must not be
 * hardcoded anywhere else. Contains no secrets (the API key lives only in
 * lib/ai/openai.ts, read from a server-only env var).
 */

// Default grading model. Swap to a cheaper model here without touching the route.
export const GRADING_MODEL = "gpt-5.4";

// Reasoning effort for the grader.
export const REASONING_EFFORT = "medium" as const;

// --- Cost controls ---------------------------------------------------------
// Generous limits: a data-response question can include pasted stimulus text,
// and extended essays are long. Enforced client + server.
export const MAX_QUESTION_CHARS = 4000;
export const MAX_ANSWER_CHARS = 9000;
// Bigger structured JSON (classification + breakdown + metadata) plus reasoning
// headroom for gpt-5.4. Calibration showed 3200 occasionally truncated the JSON
// (status=incomplete -> fail-closed 502); 4400 gives reliable headroom.
export const MAX_OUTPUT_TOKENS = 4400;
export const REQUEST_TIMEOUT_MS = 45_000;

// --- Pilot safety ------------------------------------------------------------
// Per-user daily grading cap: successful SAVED grades since the start of the
// current UTC day (counted from the attempts table — no new storage).
// Feedback-only grades count too; they use the same grading capacity.
export const DAILY_GRADE_LIMIT = 30;

// --- Subject scope ---------------------------------------------------------
// v1 grades Economics only. Other subjects are intentionally not graded yet so
// Aptly never gives weak/misleading feedback outside its designed subject.
export const GRADABLE_SUBJECTS: readonly Subject[] = ["Economics"];

export function isGradableSubject(subject: string): subject is Subject {
  return (GRADABLE_SUBJECTS as readonly string[]).includes(subject);
}
