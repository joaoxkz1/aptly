/**
 * Structured grading-error observability (IB Marking Fidelity).
 *
 * Pure, no secrets — safe to import anywhere (and to unit-test). The server
 * tracks WHICH stage failed for its own logs; the client only ever receives a
 * stable generic code and message. No API key, answer text, user email, or raw
 * model output is ever placed in a client-visible payload.
 */

export const GRADE_STAGES = [
  "assessment_policy",
  "openai",
  "structured_output",
  "schema_validation",
  "persistence",
  "unknown",
] as const;

export type GradeStage = (typeof GRADE_STAGES)[number];

/** The single stable code the client ever sees for a grading failure. */
export const GRADE_ERROR_CODE = "grading_failed";

/** User-facing message. Contains no stage, no request id, no secrets. */
export function clientGradeErrorMessage(): string {
  return "We couldn't complete this mark estimate. Your answer has not been saved. Please try again.";
}

/**
 * Server-only structured log line. Contains the failure stage and a stable
 * non-secret request id — never the answer, key, email, or raw model output.
 */
export function gradeStageLog(stage: GradeStage, requestId: string): string {
  return `[grade] stage=${stage} reqId=${requestId}`;
}
