/**
 * Grade and Practice share this identity contract, not a shared workflow.
 *
 * A transport error, malformed response, ambiguous 5xx, or missing result is
 * uncertain: keep the key and reconcile it on the next explicit user action.
 * `request_in_progress` also keeps the key; it never permits another operation.
 *
 * Both routes emit `request_failed` only after a failed reservation has been
 * reconciled against durable storage and no saved result exists. Record that
 * terminal state without dispatching anything. The next explicit retry may
 * retire its key while keeping the student's text/selectors.
 *
 * A usable saved result completes the identity. Only an explicit new intent
 * (including another question after success) starts another operation.
 */
export type OperationOutcome = "uncertain" | "processing" | "completed" | "terminal_failed";

export function classifyOperationOutcome(
  status: number,
  code: string | null | undefined,
  hasSavedResult = false,
): OperationOutcome {
  if (status >= 200 && status < 300 && hasSavedResult) return "completed";
  if (status === 409 && code === "request_in_progress") return "processing";
  if (status === 409 && code === "request_failed") return "terminal_failed";
  return "uncertain";
}
