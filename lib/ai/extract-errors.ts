import { safeErrorClass, supportReference } from "./grade-errors";

/**
 * Structured scan-extraction error observability (Aptly Scan).
 *
 * Pure, no secrets — mirrors lib/ai/grade-errors.ts. The server logs WHICH
 * stage failed as one structured, production-safe event; the client only ever
 * receives a stable generic code, a friendly message, and a short non-secret
 * support reference. No image bytes, image URLs, file names, extracted text,
 * student content, API key, or raw provider/database output is ever placed in
 * a log line or a client-visible payload.
 */

export const EXTRACT_STAGES = [
  "validation", // multipart parsing + server-side image checks
  "rate_limit",
  "openai",
  "structured_output",
  "schema_validation",
  "usage_record", // recording the no-content daily-cap row
  "unknown",
] as const;

export type ExtractStage = (typeof EXTRACT_STAGES)[number];

/** The single stable code the client ever sees for an extraction failure. */
export const EXTRACT_ERROR_CODE = "extraction_failed";

/** Dedicated code when the per-user daily scan-extraction limit is reached. */
export const EXTRACT_LIMIT_ERROR_CODE = "daily_scan_limit_reached";

/** Dedicated safe codes for server-side upload validation failures. */
export const EXTRACT_UNSUPPORTED_TYPE_CODE = "unsupported_image_type";
export const EXTRACT_TOO_LARGE_CODE = "image_too_large";
/** The image header declares dimensions beyond the scan limit (client bypass). */
export const EXTRACT_DIMENSIONS_CODE = "image_dimensions_too_large";
/** The model completed but transcribed no usable text (blurry/empty page). */
export const EXTRACT_UNREADABLE_CODE = "image_unreadable";

/** User-facing extraction-failure message. No stage, no internals. */
export function clientExtractionErrorMessage(reference?: string | null): string {
  const base =
    "Aptly couldn't read your image. Nothing was changed. Please try again. If processing had already started, this try may count toward today's limit.";
  return reference ? `${base} Reference: ${reference}` : base;
}

/** User-facing message for the daily scan limit (grading is unaffected). */
export function clientScanLimitMessage(): string {
  return "You’ve reached today’s Aptly scan limit. You can still type or paste your work — grading is unaffected.";
}

/** User-facing message for an unreadable image (honest, actionable). */
export function clientUnreadableImageMessage(): string {
  return "Aptly could not read that image clearly. Try a closer, brighter photo. The review was processed, so it counts toward today's limit.";
}

/** User-facing message for an unsupported file type. */
export function clientUnsupportedTypeMessage(): string {
  return "That file type is not supported. Use JPG, PNG, or WebP.";
}

/** User-facing message for an oversized image. */
export function clientImageTooLargeMessage(): string {
  return "That image is too large. Choose an image under 8 MB.";
}

/** User-facing message for over-limit pixel dimensions. */
export function clientImageDimensionsMessage(): string {
  return "That image is too large to scan. Try a smaller photo.";
}

/** The ONE client-side mapping from a failed extraction response to user copy. */
export function clientMessageForExtractionFailure(
  status: number,
  code: string,
  reference?: string | null
): string {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (code === EXTRACT_UNSUPPORTED_TYPE_CODE) return clientUnsupportedTypeMessage();
  if (code === EXTRACT_TOO_LARGE_CODE) return clientImageTooLargeMessage();
  if (code === EXTRACT_DIMENSIONS_CODE) return clientImageDimensionsMessage();
  if (code === EXTRACT_UNREADABLE_CODE) return clientUnreadableImageMessage();
  if (status === 429 || code === EXTRACT_LIMIT_ERROR_CODE) return clientScanLimitMessage();
  return clientExtractionErrorMessage(reference);
}

/**
 * A safe DETAIL for logs, extracted ONLY from Aptly's own fail-closed
 * extraction validator, whose messages are code-authored constants naming the
 * failing FIELD (e.g. "invalid extraction result: answer") — never student
 * text, model output, or provider payloads. Any other error yields null.
 */
const SAFE_EXTRACTION_DETAIL = /^invalid extraction result: [\w .-]{1,60}$/;

export function safeExtractionDetail(err: unknown): string | null {
  if (err instanceof Error && SAFE_EXTRACTION_DETAIL.test(err.message)) {
    return err.message;
  }
  return null;
}

/**
 * A coarse, non-identifying byte-size bucket for the UPLOADED (already
 * client-processed) image — cost observability only, never an exact size.
 */
export function imageSizeBucket(bytes: number): string {
  if (bytes <= 512 * 1024) return "<=0.5MB";
  if (bytes <= 1024 * 1024) return "<=1MB";
  if (bytes <= 2 * 1024 * 1024) return "<=2MB";
  if (bytes <= 4 * 1024 * 1024) return "<=4MB";
  return ">4MB";
}

/** The exact production log event for a failed scan-extraction request. */
export interface ExtractFailureLog {
  event: "scan_extraction_failed";
  requestId: string;
  stage: ExtractStage;
  errorClass: string;
  status: number;
  timestamp: string;
  /** Coarse size bucket of the uploaded image (cost observability). */
  sizeBucket?: string;
  /** Present ONLY for Aptly's own constant validator messages (safe field names). */
  detail?: string;
}

/**
 * One structured, production-safe log event per extraction failure. Contains
 * only the stable event name, the non-secret request id, the pipeline stage, a
 * safe error class, the HTTP status, a timestamp, and (when known) a coarse
 * image size bucket — never image bytes, file names, extracted text, student
 * content, user ids, keys, or raw provider/database output.
 */
export function buildExtractFailureLog(
  stage: ExtractStage,
  requestId: string,
  err: unknown,
  status: number,
  sizeBucket?: string | null,
  now: Date = new Date()
): ExtractFailureLog {
  const detail = safeExtractionDetail(err);
  return {
    event: "scan_extraction_failed",
    requestId,
    stage,
    errorClass: safeErrorClass(err),
    status,
    timestamp: now.toISOString(),
    ...(sizeBucket != null ? { sizeBucket } : {}),
    ...(detail !== null ? { detail } : {}),
  };
}

export { supportReference };
