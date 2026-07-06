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

// --- Targeted practice generation (Practice Loop) ---------------------------
// Generation uses the SAME model as grading (one model everywhere this
// release). Separate, conservative per-user UTC-day cap — each generation is
// its own paid call, distinct from the grading cap above. Counted from the
// user's practice_questions rows created today (RLS-scoped, no new storage).
export const DAILY_PRACTICE_GENERATION_LIMIT = 10;
// A generated question + short source stimulus is far smaller than a grade
// result, but reasoning tokens share this budget — keep sensible headroom.
export const PRACTICE_MAX_OUTPUT_TOKENS = 2600;
export const PRACTICE_REQUEST_TIMEOUT_MS = 45_000;

// --- Aptly Scan (image → candidate text extraction) --------------------------
// Extraction uses the SAME model as grading (one model everywhere this
// release), in vision mode, for exactly one job: transcribing visible text
// into candidate editable fields. It never marks, classifies, or persists.
//
// Separate durable per-user UTC-day cap: each SUCCESSFUL extraction records
// one no-content row in scan_extraction_usage (see migration 0005) and the
// route counts today's rows before the paid vision call. Failed validation,
// failed model calls, and unreadable images never consume the allowance.
export const DAILY_EXTRACTION_LIMIT = 10;
// Transcription is perception, not judgement — low reasoning effort keeps the
// call cheap while the output budget leaves room for a full transcribed page
// (question + answer + source can approach 17k chars at the field caps).
export const EXTRACTION_REASONING_EFFORT = "low" as const;
export const EXTRACTION_MAX_OUTPUT_TOKENS = 5200;
export const EXTRACTION_REQUEST_TIMEOUT_MS = 60_000;
// Acceptance ceiling for the ORIGINAL selected file (client + server). The
// client downscales/re-encodes before upload, so what actually reaches the
// model is a ≤2048px JPEG — the 8 MB ceiling is an acceptance limit, not a
// transport size.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Client-side downscale target: longest dimension after processing.
export const IMAGE_MAX_DIMENSION = 2048;

// --- Diagram Evidence (image → structured study feedback) --------------------
// Diagram review uses the SAME model as grading (one model everywhere this
// release), in vision mode, for exactly one job: cautious, feedback-only
// observations about one close-up diagram photo. It never marks, never
// classifies the paper, and never changes an estimate.
//
// Separate durable per-user UTC-day cap (diagram_review_usage, migration
// 0006), fully independent from the Scan extraction cap: each successful
// review — including an honest "unable to assess" — records one no-content
// row. Failed validation and failed model calls never consume the allowance.
export const DAILY_DIAGRAM_REVIEW_LIMIT = 10;
// Observation, not judgement — low effort keeps the call cheap; the output is
// a small structured object, so the budget mostly covers reasoning headroom.
export const DIAGRAM_REASONING_EFFORT = "low" as const;
export const DIAGRAM_MAX_OUTPUT_TOKENS = 2600;
export const DIAGRAM_REQUEST_TIMEOUT_MS = 60_000;
// Image acceptance limits are shared with Aptly Scan: MAX_IMAGE_BYTES and
// IMAGE_MAX_DIMENSION above apply to diagram photos identically.

// --- Subject scope ---------------------------------------------------------
// v1 grades Economics only. Other subjects are intentionally not graded yet so
// Aptly never gives weak/misleading feedback outside its designed subject.
export const GRADABLE_SUBJECTS: readonly Subject[] = ["Economics"];

export function isGradableSubject(subject: string): subject is Subject {
  return (GRADABLE_SUBJECTS as readonly string[]).includes(subject);
}
