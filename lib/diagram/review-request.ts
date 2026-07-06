import { DIAGRAM_REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import {
  DIAGRAM_ERROR_CODE,
  clientMessageForDiagramReviewFailure,
} from "@/lib/ai/diagram-errors";
import { isDiagramEvidence, type DiagramEvidence } from "./evidence";

/**
 * Client-side diagram-review request (browser only).
 *
 * One POST to /api/diagram carrying the processed photo plus the question and
 * answer as review context. NEVER throws and never blocks grading: every
 * failure — network, timeout, limit, server error, malformed response —
 * resolves to `{ evidence: null, failureMessage }` so the caller can grade,
 * save, and show a gentle non-blocking notice. The photo's original file name
 * never leaves the device.
 */

export interface DiagramReviewResult {
  evidence: DiagramEvidence | null;
  /** Non-null exactly when evidence is null: the user-facing reason. */
  failureMessage: string | null;
}

export async function requestDiagramReview(
  image: Blob,
  question: string,
  answer: string
): Promise<DiagramReviewResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIAGRAM_REQUEST_TIMEOUT_MS + 5000);
  try {
    const form = new FormData();
    // Generic name: the original file name never leaves the device.
    form.append("image", image, "diagram.jpg");
    form.append("question", question);
    form.append("answer", answer);
    const res = await fetch("/api/diagram", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      let code = DIAGRAM_ERROR_CODE;
      let reference: string | null = null;
      try {
        const body = (await res.json()) as { error?: string; reference?: string };
        if (typeof body.error === "string") code = body.error;
        if (typeof body.reference === "string") reference = body.reference;
      } catch {
        // ignore parse failure; use the generic code
      }
      return {
        evidence: null,
        failureMessage: clientMessageForDiagramReviewFailure(res.status, code, reference),
      };
    }

    const body = (await res.json()) as { evidence?: unknown };
    // Defensive: only a well-formed review is ever attached to an attempt.
    if (!isDiagramEvidence(body.evidence)) {
      return {
        evidence: null,
        failureMessage: clientMessageForDiagramReviewFailure(502, DIAGRAM_ERROR_CODE),
      };
    }
    return { evidence: body.evidence, failureMessage: null };
  } catch {
    return {
      evidence: null,
      failureMessage: clientMessageForDiagramReviewFailure(502, DIAGRAM_ERROR_CODE),
    };
  } finally {
    clearTimeout(timer);
  }
}
