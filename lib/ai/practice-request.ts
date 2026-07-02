import { PRACTICE_REQUEST_TIMEOUT_MS } from "./config";
import type { PracticeQuestion } from "@/lib/types";

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

export function createPracticeGenerationClient(fetchImpl: typeof fetch = fetch) {
  let pending: Promise<PracticeGenerationOutcome> | null = null;

  async function issue(regenerate: boolean): Promise<PracticeGenerationOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PRACTICE_REQUEST_TIMEOUT_MS + 5000);
    try {
      const res = await fetchImpl("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The boolean intent is the ONLY field sent — the server derives the
        // whole target from saved attempts and ignores anything else anyway.
        body: JSON.stringify({ regenerate }),
        signal: controller.signal,
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        // ignore parse failure; fall back to the generic code
      }
      return {
        status: res.status,
        code: typeof body.error === "string" ? body.error : "practice_generation_failed",
        reference: typeof body.reference === "string" ? body.reference : null,
        practiceQuestion:
          res.ok && body.practiceQuestion != null
            ? (body.practiceQuestion as PracticeQuestion)
            : null,
        reused: body.reused === true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /**
     * At most one request in flight: concurrent callers adopt the same
     * pending promise (whatever their flag — the UI can only express one
     * intent at a time). A settled request clears the slot for the next.
     */
    request(opts: { regenerate?: boolean } = {}): Promise<PracticeGenerationOutcome> {
      if (pending === null) {
        pending = issue(opts.regenerate === true).finally(() => {
          pending = null;
        });
      }
      return pending;
    },
  };
}
