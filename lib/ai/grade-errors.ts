/**
 * Structured grading-error observability (IB Marking Fidelity + Pilot Trust).
 *
 * Pure, no secrets — safe to import anywhere (and to unit-test). The server
 * logs WHICH stage failed as one structured, production-safe event; the client
 * only ever receives a stable generic code, a friendly message, and a short
 * non-secret support reference. No API key, question/answer text, source
 * material, user email/id, or raw model output is ever placed in a log line or
 * a client-visible payload.
 */

export const GRADE_STAGES = [
  "assessment_policy",
  "practice_context", // fetching the stored Aptly-generated question/source
  "revision_context", // fetching the parent attempt's retained manual source
  "rate_limit",
  "openai",
  "structured_output",
  "schema_validation",
  "persistence",
  "unknown",
] as const;

export type GradeStage = (typeof GRADE_STAGES)[number];

/** The single stable code the client ever sees for a grading failure. */
export const GRADE_ERROR_CODE = "grading_failed";

/** Dedicated code when the per-user daily pilot grading limit is reached. */
export const DAILY_LIMIT_ERROR_CODE = "daily_grade_limit_reached";

/**
 * Short, non-secret support reference derived from the random per-request id
 * (a UUID minted server-side). Contains no user data or credentials — it only
 * lets the founder find the matching server log line.
 */
export function supportReference(requestId: string): string {
  return requestId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** User-facing failure message. No stage, no secrets; the optional reference is
 *  the safe id from `supportReference` so a tester can report the failure. */
export function clientGradeErrorMessage(reference?: string | null): string {
  const base =
    "We couldn't complete this mark estimate. Your answer has not been saved. Please try again.";
  return reference ? `${base} Reference: ${reference}` : base;
}

/** User-facing message for the daily pilot grading limit (no internals). */
export function clientDailyLimitMessage(): string {
  return "You’ve reached today’s Aptly pilot grading limit. Try again tomorrow.";
}

/** The ONE client-side mapping from a failed grade response to user copy. */
export function clientMessageForGradeFailure(
  status: number,
  code: string,
  reference?: string | null
): string {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (code === "too_long")
    return "Your question or answer is too long. Please shorten it and try again.";
  if (status === 429 || code === DAILY_LIMIT_ERROR_CODE) return clientDailyLimitMessage();
  return clientGradeErrorMessage(reference);
}

/**
 * A safe error CATEGORY for logs — never the error MESSAGE, which could quote
 * student text (e.g. a JSON.parse SyntaxError over model output).
 */
export function safeErrorClass(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "timeout";
    return err.name || "Error";
  }
  return typeof err;
}

/**
 * A safe DETAIL for logs, extracted ONLY from Aptly's own fail-closed
 * validators, whose messages are code-authored constants naming the failing
 * FIELD (e.g. "invalid grade result: assessableEarned") — never student text,
 * model output, or provider payloads. Any other error yields null, so a
 * quoted-text SyntaxError or raw API error can never leak through this path.
 * Added after five schema_validation failures were undiagnosable because the
 * log carried only the class "Error".
 */
const SAFE_VALIDATION_PREFIX = /^invalid (grade result|feedback|generated practice): [\w .-]{1,60}$/;

export function safeValidationDetail(err: unknown): string | null {
  if (err instanceof Error && SAFE_VALIDATION_PREFIX.test(err.message)) {
    return err.message;
  }
  return null;
}

/** The exact production log event for a failed grade request. */
export interface GradeFailureLog {
  event: "grade_request_failed";
  requestId: string;
  stage: GradeStage;
  errorClass: string;
  status: number;
  timestamp: string;
  /** Present ONLY for Aptly's own constant validator messages (safe field names). */
  detail?: string;
}

/**
 * One structured, production-safe log event per grade-route failure. Contains
 * only the stable event name, the non-secret request id, the pipeline stage, a
 * safe error class, the HTTP status returned, and a timestamp — never the
 * question, answer, source material, email, user id, key, or raw model output.
 */
export function buildGradeFailureLog(
  stage: GradeStage,
  requestId: string,
  err: unknown,
  status: number,
  now: Date = new Date()
): GradeFailureLog {
  const detail = safeValidationDetail(err);
  return {
    event: "grade_request_failed",
    requestId,
    stage,
    errorClass: safeErrorClass(err),
    status,
    timestamp: now.toISOString(),
    ...(detail !== null ? { detail } : {}),
  };
}
