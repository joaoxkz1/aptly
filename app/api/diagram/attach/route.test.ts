import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const RESERVATION_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_KEY = "44444444-4444-4444-8444-444444444444";
const EVIDENCE = {
  version: 1,
  status: "reviewed_clearly",
  graphTypeObserved: "demand and supply",
  relevanceToQuestion: "appears_relevant",
  elements: [{ element: "axes_labels", observed: "visible" }],
  consistencyWithAnswer: "supports",
  improvements: ["Label the new equilibrium."],
};
const mocks = vi.hoisted(() => ({
  claims: { sub: "11111111-1111-4111-8111-111111111111" } as Record<
    string,
    unknown
  > | null,
  reservation: null as Record<string, unknown> | null,
  attach: vi.fn(async () => "attached"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.claims } }) },
  }),
}));
vi.mock("@/lib/ai/usage-reservations", () => ({
  fetchReservationForUser: async () => mocks.reservation,
}));
vi.mock("@/lib/supabase/server-authority", () => ({
  attachDiagramEvidence: mocks.attach,
}));

import { structuredResultHash } from "@/lib/ai/request-integrity";
import { POST } from "./route";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/diagram/attach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attemptId: ATTEMPT_ID,
      reservationId: RESERVATION_ID,
      evidence: EVIDENCE,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  mocks.claims = { sub: USER_ID };
  mocks.reservation = {
    capability: "diagram",
    status: "succeeded",
    operationGroupKey: OPERATION_KEY,
    resultHash: structuredResultHash(EVIDENCE),
  };
  vi.clearAllMocks();
});

describe("POST /api/diagram/attach", () => {
  it("requires auth and exact UUID-bound input", async () => {
    mocks.claims = null;
    expect((await POST(request())).status).toBe(401);
    mocks.claims = { sub: USER_ID };
    expect((await POST(request({ forged: true }))).status).toBe(400);
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("rejects a different-user/missing, incomplete, or hash-mismatched reservation", async () => {
    for (const reservation of [
      null,
      { ...mocks.reservation, status: "processing" },
      { ...mocks.reservation, resultHash: "0".repeat(64) },
    ]) {
      mocks.reservation = reservation;
      expect((await POST(request())).status).toBe(400);
    }
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("attaches only through the operation-bound authority helper", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.attach).toHaveBeenCalledWith({
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
      operationGroupKey: OPERATION_KEY,
      evidence: EVIDENCE,
    });
  });
});
