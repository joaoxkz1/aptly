import { safeErrorClass, supportReference } from "./grade-errors";
import { classifyOperationOutcome } from "./operation-outcome";

/**
 * Structured practice-generation error observability (Practice Loop).
 *
 * Pure, no secrets — mirrors lib/ai/grade-errors.ts. The server logs WHICH
 * stage failed as one structured, production-safe event; the client only ever
 * receives a stable generic code, a friendly message, and a short non-secret
 * support reference. No API key, student data, learning insights, or raw model
 * output is ever placed in a log line or a client-visible payload.
 */

export const PRACTICE_STAGES = [
  "reuse_lookup", // reopening an existing unanswered question (idempotency)
  "profile_lookup",
  "bank_selection",
  "rate_limit",
  "target_derivation",
  "openai",
  "structured_output",
  "schema_validation",
  "persistence",
  "unknown",
] as const;

export type PracticeStage = (typeof PRACTICE_STAGES)[number];

/** The single stable code the client ever sees for a generation failure. */
export const PRACTICE_ERROR_CODE = "practice_generation_failed";

/** Dedicated code when the per-user daily practice-generation limit is hit. */
export const PRACTICE_LIMIT_ERROR_CODE = "daily_practice_limit_reached";

/** Dedicated code when there is not yet enough marked evidence for a focus. */
export const PRACTICE_NO_FOCUS_CODE = "no_focus_available";
export const PRACTICE_LEVEL_REQUIRED_CODE = "economics_level_required";

/** User-facing generation-failure message. No stage, no internals. */
export function clientPracticeErrorMessage(reference?: string | null): string {
  const base =
    "We couldn't confirm whether your practice question was saved. Try again to check the same request and recover it if it was saved. If processing had already started, this try may count toward today's limit.";
  return reference ? `${base} Reference: ${reference}` : base;
}

/** User-facing message for the daily practice-generation limit. */
export function clientPracticeLimitMessage(): string {
  return "You’ve reached today’s Aptly practice-question limit. Your grading limit is separate — you can keep submitting answers, and generate more practice tomorrow.";
}

/** User-facing message when no evidence-backed focus exists yet. */
export function clientPracticeNoFocusMessage(): string {
  return "Aptly doesn’t have enough marked evidence to pick a useful focus yet. Grade a few answers across at least two topics, then come back for targeted practice.";
}

/** The ONE client-side mapping from a failed generation response to user copy. */
export function clientMessageForPracticeFailure(
  status: number,
  code: string,
  reference?: string | null
): string {
  const outcome = classifyOperationOutcome(status, code);
  if (outcome === "terminal_failed") {
    return "The previous request failed and no practice question was saved. Try again to start a new request. Your selections are unchanged; the new request may count toward today's limit.";
  }
  if (outcome === "processing") {
    return "Your practice question is still being prepared. Try again to check the same request.";
  }
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 429 || code === PRACTICE_LIMIT_ERROR_CODE) return clientPracticeLimitMessage();
  if (code === PRACTICE_LEVEL_REQUIRED_CODE) {
    return "Choose IB Economics SL or HL before generating a question.";
  }
  if (code === PRACTICE_NO_FOCUS_CODE) return clientPracticeNoFocusMessage();
  if (code === "no_supported_question") return "There are no more reviewed questions for this topic and mark total at your course level. Choose a lower mark total or another topic.";
  if (code === "unsupported_focus") return "This exact focused-practice type isn’t available yet. You can practise this topic instead.";
  if (code === "focus_attempt_unavailable") return "This saved answer is no longer available. Choose a question to practise instead.";
  if (code === "focus_changed") return "Your saved focus has changed. Reload to see the current recommendation, or choose general practice.";
  if (code === "focused_generation_failed") return clientPracticeErrorMessage(reference);
  return clientPracticeErrorMessage(reference);
}

/** The exact production log event for a failed practice-generation request. */
export interface PracticeFailureLog {
  event: "practice_request_failed";
  requestId: string;
  stage: PracticeStage;
  errorClass: string;
  status: number;
  timestamp: string;
}

/**
 * One structured, production-safe log event per generation failure. Contains
 * only the stable event name, the non-secret request id, the pipeline stage, a
 * safe error class, the HTTP status, and a timestamp — never student data,
 * derived insights, the key, or raw model output.
 */
export function buildPracticeFailureLog(
  stage: PracticeStage,
  requestId: string,
  err: unknown,
  status: number,
  now: Date = new Date()
): PracticeFailureLog {
  return {
    event: "practice_request_failed",
    requestId,
    stage,
    errorClass: safeErrorClass(err),
    status,
    timestamp: now.toISOString(),
  };
}

export { supportReference };
