import { PRACTICE_REQUEST_TIMEOUT_MS } from "./config";
import type { PracticeQuestion } from "@/lib/types";
import { isUuid } from "@/lib/auth/verified-user";
import { classifyOperationOutcome, type OperationOutcome } from "./operation-outcome";
import type { EconomicsCourseLevel } from "@/lib/assessment/course-level";

/**
 * Practice Loop hardening — the ONE client-side path to `/api/practice`.
 *
 * Pure client logic (no secrets, unit-tested): a factory whose `request`
 * dedupes concurrent calls onto a single shared in-flight promise, so a
 * double-click, strict-mode double mount, rerender race, or impatient retry
 * inside one tab can never issue two paid generation requests. The server's
 * reuse-first idempotency covers everything across tabs/refreshes.
 *
 * The only intent a caller can express is `regenerate: true` — the explicit
 * "Generate another question" action. Everything else is reuse-first.
 */

export interface PracticeGenerationOutcome {
  status: number;
  code: string;
  reference: string | null;
  practiceQuestion: PracticeQuestion | null;
  /** True when the server reopened an existing unanswered question. */
  reused: boolean;
}

export interface PracticeGenerationRequest {
  /** Local identity only; the route always derives the trusted level from claims. */
  courseLevel?: EconomicsCourseLevel;
  marks: 2 | 10 | 15;
  topicCode: string;
  context: "general" | "current_focus" | "answer_feedback";
  sourceAttemptId?: string | null;
  regenerate?: boolean;
}

export function createPracticeGenerationClient(fetchImpl: typeof fetch = fetch) {
  let pending: Promise<PracticeGenerationOutcome> | null = null;
  let pendingSignature: string | null = null;
  let retryIdentity: { signature: string; key: string; outcome: OperationOutcome } | null = null;

  async function issue(
    input: PracticeGenerationRequest,
    idempotencyKey: string
  ): Promise<PracticeGenerationOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PRACTICE_REQUEST_TIMEOUT_MS + 5000);
    try {
      const res = await fetchImpl("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only request selectors cross this boundary. Focus evidence and all
        // question/grading metadata are resolved again by the server.
        body: JSON.stringify({
          marks: input.marks,
          topicCode: input.topicCode,
          context: input.context,
          ...(input.context === "answer_feedback" ? { sourceAttemptId: input.sourceAttemptId } : {}),
          regenerate: input.regenerate === true,
          idempotencyKey,
        }),
        signal: controller.signal,
      });
      let body: Record<string, unknown> = {};
      try {
        const parsed: unknown = await res.json();
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        // ignore parse failure; fall back to the generic code
      }
      const savedQuestion = body.practiceQuestion;
      const hasSavedQuestion = typeof savedQuestion === "object" && savedQuestion !== null &&
        !Array.isArray(savedQuestion) && isUuid((savedQuestion as Record<string, unknown>).id);
      const outcome = {
        status: res.status,
        code: typeof body.error === "string" ? body.error : "practice_generation_failed",
        reference: typeof body.reference === "string" ? body.reference : null,
        practiceQuestion:
          res.ok && hasSavedQuestion
            ? (savedQuestion as PracticeQuestion)
            : null,
        reused: body.reused === true,
      };
      const operationOutcome = classifyOperationOutcome(res.status, outcome.code, outcome.practiceQuestion !== null);
      if (operationOutcome === "completed") retryIdentity = null;
      else if (retryIdentity?.key === idempotencyKey) retryIdentity.outcome = operationOutcome;
      return outcome;
    } finally {
      clearTimeout(timer);
    }
  }

  const client = {
    /**
     * At most one request in flight: concurrent callers adopt the same
     * pending promise (whatever their flag — the UI can only express one
     * intent at a time). A settled request clears the slot for the next.
     */
    request(opts: PracticeGenerationRequest): Promise<PracticeGenerationOutcome> {
      const normalized = { ...opts, regenerate: opts.regenerate === true };
      const signature = JSON.stringify(normalized);
      if (pending !== null && pendingSignature !== signature) {
        // Navigation to another intent must not receive the old intent's result.
        return pending.catch(() => undefined).then(() => client.request(opts));
      }
      if (pending === null) {
        pendingSignature = signature;
        const idempotencyKey =
          retryIdentity?.signature === signature && retryIdentity.outcome !== "terminal_failed"
            ? retryIdentity.key
            : crypto.randomUUID();
        // request() is called by explicit user action. A terminal response
        // only marks the old identity; this next action may start a fresh one.
        retryIdentity = { signature, key: idempotencyKey, outcome: "uncertain" };
        pending = issue(normalized, idempotencyKey).finally(() => {
          pending = null;
          pendingSignature = null;
        });
      }
      return pending;
    },
  };
  return client;
}
