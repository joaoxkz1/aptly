import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDiagramReview } from "./review-request";
import type { DiagramEvidence } from "./evidence";

/**
 * The client-side review request NEVER throws and never blocks grading:
 * every failure resolves to { evidence: null, failureMessage } so the submit
 * flow can always grade, save, and show a gentle notice. The original file
 * name never leaves the device.
 */

const EVIDENCE: DiagramEvidence = {
  version: 1,
  status: "reviewed_clearly",
  graphTypeObserved: "demand and supply",
  relevanceToQuestion: "appears_relevant",
  elements: [{ element: "axes_labels", observed: "visible" }],
  consistencyWithAnswer: "supports",
  improvements: [],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const IMAGE = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
const KEY = "22222222-2222-4222-8222-222222222222";
const OPERATION_KEY = "33333333-3333-4333-8333-333333333333";
const RESERVATION_ID = "44444444-4444-4444-8444-444444444444";

function review() {
  return requestDiagramReview(IMAGE, "Q", "A", KEY, OPERATION_KEY);
}

describe("requestDiagramReview", () => {
  it("returns the evidence on success and posts with a generic file name", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { evidence: EVIDENCE, reservationId: RESERVATION_ID })
    );
    const result = await review();
    expect(result).toEqual({
      evidence: EVIDENCE,
      reservationId: RESERVATION_ID,
      failureMessage: null,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    expect(url).toBe("/api/diagram");
    const file = init.body.get("image") as File;
    expect(file.name).toBe("diagram.jpg");
    expect(init.body.get("question")).toBe("Q");
    expect(init.body.get("answer")).toBe("A");
    expect(init.body.get("idempotencyKey")).toBe(KEY);
    expect(init.body.get("attemptOperationKey")).toBe(OPERATION_KEY);
  });

  it("maps the daily limit to its honest, non-blocking message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: "daily_diagram_review_limit_reached" })
    );
    const result = await review();
    expect(result.evidence).toBeNull();
    expect(result.failureMessage).toContain("diagram review limit");
    expect(result.failureMessage).toContain("still graded");
  });

  it("maps an expired session to the standard sign-in-again message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    const result = await review();
    expect(result.evidence).toBeNull();
    expect(result.failureMessage).toBe("Your session expired. Please sign in again.");
  });

  it("a server failure resolves (never throws) with the generic message + reference", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(502, { error: "diagram_review_failed", reference: "AB12CD34" })
    );
    const result = await review();
    expect(result.evidence).toBeNull();
    expect(result.failureMessage).toContain("Your written feedback is unaffected");
    expect(result.failureMessage).toContain("AB12CD34");
  });

  it("a network error resolves (never throws)", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    const result = await review();
    expect(result.evidence).toBeNull();
    expect(result.failureMessage).not.toBeNull();
  });

  it("a malformed success body is rejected — junk is never attached to an attempt", async () => {
    for (const body of [{}, { evidence: null }, { evidence: { status: "perfect" } }]) {
      fetchMock.mockResolvedValue(jsonResponse(200, body));
      const result = await review();
      expect(result.evidence).toBeNull();
      expect(result.failureMessage).not.toBeNull();
    }
  });
});
