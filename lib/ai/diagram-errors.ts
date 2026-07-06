import { safeErrorClass, supportReference } from "./grade-errors";
import {
  EXTRACT_DIMENSIONS_CODE,
  EXTRACT_TOO_LARGE_CODE,
  EXTRACT_UNSUPPORTED_TYPE_CODE,
  clientImageDimensionsMessage,
  clientImageTooLargeMessage,
  clientUnsupportedTypeMessage,
  imageSizeBucket,
} from "./extract-errors";

/**
 * Structured diagram-review error observability (Diagram Evidence V1).
 *
 * Pure, no secrets — mirrors lib/ai/extract-errors.ts. The server logs WHICH
 * stage failed as one structured, production-safe event; the client only ever
 * receives a stable generic code, a friendly message, and a short non-secret
 * support reference. No image bytes, image URLs, file names, question or
 * answer text, student content, API key, or raw provider/database output is
 * ever placed in a log line or a client-visible payload.
 *
 * A failed diagram review is NEVER a grading failure: every client message
 * here says so, because the written feedback flow continues without it.
 */

export const DIAGRAM_STAGES = [
  "validation", // multipart parsing + server-side image and text checks
  "rate_limit",
  "openai",
  "structured_output",
  "schema_validation",
  "usage_record", // recording the no-content daily-cap row
  "unknown",
] as const;

export type DiagramStage = (typeof DIAGRAM_STAGES)[number];

/** The single stable code the client ever sees for a review failure. */
export const DIAGRAM_ERROR_CODE = "diagram_review_failed";

/** Dedicated code when the per-user daily diagram-review limit is reached. */
export const DIAGRAM_LIMIT_ERROR_CODE = "daily_diagram_review_limit_reached";

// Image-validation codes are shared with Aptly Scan — the checks (and their
// meanings) are identical, so the codes are too.
export {
  EXTRACT_DIMENSIONS_CODE as DIAGRAM_DIMENSIONS_CODE,
  EXTRACT_TOO_LARGE_CODE as DIAGRAM_TOO_LARGE_CODE,
  EXTRACT_UNSUPPORTED_TYPE_CODE as DIAGRAM_UNSUPPORTED_TYPE_CODE,
};

/** User-facing review-failure message. No stage, no internals, never blocking. */
export function clientDiagramReviewErrorMessage(reference?: string | null): string {
  const base =
    "Aptly couldn't review your diagram this time. Your written feedback is unaffected.";
  return reference ? `${base} Reference: ${reference}` : base;
}

/** User-facing message for the daily diagram-review limit (grading unaffected). */
export function clientDiagramLimitMessage(): string {
  return "You've reached today's diagram review limit. Your answer was still graded normally — attach the diagram again tomorrow for a review.";
}

/** The ONE client-side mapping from a failed review response to user copy. */
export function clientMessageForDiagramReviewFailure(
  status: number,
  code: string,
  reference?: string | null
): string {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (code === EXTRACT_UNSUPPORTED_TYPE_CODE) return clientUnsupportedTypeMessage();
  if (code === EXTRACT_TOO_LARGE_CODE) return clientImageTooLargeMessage();
  if (code === EXTRACT_DIMENSIONS_CODE) return clientImageDimensionsMessage();
  if (status === 429 || code === DIAGRAM_LIMIT_ERROR_CODE) return clientDiagramLimitMessage();
  return clientDiagramReviewErrorMessage(reference);
}

/**
 * A safe DETAIL for logs, extracted ONLY from Aptly's own fail-closed
 * diagram-review validator, whose messages are code-authored constants naming
 * the failing FIELD (e.g. "invalid diagram review: status") — never student
 * text, model output, or provider payloads. Any other error yields null.
 */
const SAFE_DIAGRAM_DETAIL = /^invalid diagram review: [\w .-]{1,60}$/;

export function safeDiagramDetail(err: unknown): string | null {
  if (err instanceof Error && SAFE_DIAGRAM_DETAIL.test(err.message)) {
    return err.message;
  }
  return null;
}

/** The exact production log event for a failed diagram-review request. */
export interface DiagramFailureLog {
  event: "diagram_review_failed";
  requestId: string;
  stage: DiagramStage;
  errorClass: string;
  status: number;
  timestamp: string;
  /** Coarse size bucket of the uploaded image (cost observability). */
  sizeBucket?: string;
  /** Present ONLY for Aptly's own constant validator messages (safe field names). */
  detail?: string;
}

/**
 * One structured, production-safe log event per review failure. Contains only
 * the stable event name, the non-secret request id, the pipeline stage, a safe
 * error class, the HTTP status, a timestamp, and (when known) a coarse image
 * size bucket — never image bytes, file names, question/answer text, student
 * content, user ids, keys, or raw provider/database output.
 */
export function buildDiagramFailureLog(
  stage: DiagramStage,
  requestId: string,
  err: unknown,
  status: number,
  sizeBucket?: string | null,
  now: Date = new Date()
): DiagramFailureLog {
  const detail = safeDiagramDetail(err);
  return {
    event: "diagram_review_failed",
    requestId,
    stage,
    errorClass: safeErrorClass(err),
    status,
    timestamp: now.toISOString(),
    ...(sizeBucket != null ? { sizeBucket } : {}),
    ...(detail !== null ? { detail } : {}),
  };
}

export { imageSizeBucket, supportReference };
