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
export const MAX_QUESTION_CHARS = 600;
export const MAX_ANSWER_CHARS = 4000; // ~700 words
export const MAX_OUTPUT_TOKENS = 2000; // headroom for reasoning + compact JSON
export const REQUEST_TIMEOUT_MS = 30_000;

// --- Subject scope ---------------------------------------------------------
// v1 grades Economics only. Other subjects are intentionally not graded yet so
// Aptly never gives weak/misleading feedback outside its designed subject.
export const GRADABLE_SUBJECTS: readonly Subject[] = ["Economics"];

export function isGradableSubject(subject: string): subject is Subject {
  return (GRADABLE_SUBJECTS as readonly string[]).includes(subject);
}
