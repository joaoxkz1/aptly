import type { Subject } from "@/lib/types";

/**
 * Single source of truth for the AI grading config.
 * Change the model here once to switch providers/models later — it must not be
 * hardcoded anywhere else. Contains no secrets (the API key lives only in
 * lib/ai/openai.ts, read from a server-only env var).
 */

// Endpoint-specific model settings. Written-grading calibration is isolated
// from generation, extraction, and Diagram Evidence.
export const WRITTEN_GRADING_MODEL = "gpt-5.6-terra";
export const WRITTEN_GRADING_REASONING_EFFORT = "medium" as const;
export const PRACTICE_MODEL = "gpt-5.4";
export const PRACTICE_REASONING_EFFORT = "medium" as const;
export const EXTRACTION_MODEL = "gpt-5.4";
export const DIAGRAM_MODEL = "gpt-5.4";

// --- Cost controls ---------------------------------------------------------
// Generous limits: a data-response question can include pasted stimulus text,
// and extended essays are long. Enforced client + server.
export const MAX_QUESTION_CHARS = 4000;
export const MAX_ANSWER_CHARS = 9000;
export const MAX_TOPIC_CHARS = 80;
// Bigger structured JSON (classification + breakdown + metadata) plus reasoning
// headroom for the written grader. Calibration showed 3200 occasionally truncated the JSON
// (status=incomplete -> fail-closed 502); 4400 gives reliable headroom.
export const MAX_OUTPUT_TOKENS = 4400;
export const REQUEST_TIMEOUT_MS = 45_000;

// --- Pilot safety ------------------------------------------------------------
// Per-user UTC-day cap enforced by the durable reservation ledger (0008).
// Provider-dispatched attempts consume capacity even if the response fails.
// Completed operation replay does not reserve or dispatch again.
export const DAILY_GRADE_LIMIT = 30;

// --- Targeted practice generation (Practice Loop) ---------------------------
// Separate durable generation reservations; bank selection consumes none.
export const DAILY_PRACTICE_GENERATION_LIMIT = 10;
// A generated question + short source stimulus is far smaller than a grade
// result, but reasoning tokens share this budget — keep sensible headroom.
export const PRACTICE_MAX_OUTPUT_TOKENS = 2600;
export const PRACTICE_REQUEST_TIMEOUT_MS = 45_000;

// --- Aptly Scan (image → candidate text extraction) --------------------------
// Extraction has its own model setting and exactly one job: transcribing visible text
// into candidate editable fields. It never marks, classifies, or persists.
//
// Separate durable per-user UTC-day reservations. Preflight validation failure
// consumes none; a dispatched provider request consumes the allowance.
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
// Processed request ceiling stays below Vercel's 4.5 MB body limit, leaving
// room for multipart boundaries and the accompanying text fields.
export const MAX_PROCESSED_IMAGE_BYTES = 4 * 1024 * 1024;
// Client-side downscale target: longest dimension after processing.
export const IMAGE_MAX_DIMENSION = 2048;

// --- Diagram Evidence (image → structured observations) ----------------------
// Legacy review is feedback-only. Flag-enabled assessed review supplies bounded
// observations to the existing authoritative grader (assessed-visual-review.ts).
// Both use this model and the existing diagram reservation cap, separate from
// Scan. Provider-dispatched failures still consume their reservation.
export const DAILY_DIAGRAM_REVIEW_LIMIT = 10;
// Legacy-only settings. Assessed review uses medium effort and 4400 tokens,
// recorded independently in its snapshot; real-photo calibration is pending.
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
