import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const OPERATION_KEY = "33333333-3333-4333-8333-333333333333";
const RESERVATION_ID = "44444444-4444-4444-8444-444444444444";
const mocks = vi.hoisted(() => ({
  state: {
    claims: { sub: "11111111-1111-4111-8111-111111111111" } as Record<
      string,
      unknown
    > | null,
    outcome: "reserved",
  },
  openaiCreate: vi.fn(),
  reserve: vi.fn(),
  processing: vi.fn(async () => {}),
  succeeded: vi.fn(async () => {}),
  failed: vi.fn(async () => {}),
}));
const { state, openaiCreate, reserve, succeeded, failed } = mocks;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.state.claims } }) },
  }),
}));
vi.mock("@/lib/ai/openai", () => ({
  getOpenAI: () => ({ responses: { create: mocks.openaiCreate } }),
}));
vi.mock("@/lib/ai/usage-reservations", () => ({
  reserveAIUsage: mocks.reserve,
  markReservationProcessing: mocks.processing,
  markReservationSucceeded: mocks.succeeded,
  markReservationFailed: mocks.failed,
}));

import { POST } from "./route";

function jpegBytes(width = 1600, height = 1200): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
  ]);
}

function request(options: { includeKeys?: boolean; extra?: boolean } = {}): Request {
  const form = new FormData();
  const bytes = jpegBytes();
  form.append("image", new Blob([new Uint8Array(bytes).buffer as ArrayBuffer]), "diagram.jpg");
  form.append("question", "Explain how a subsidy affects equilibrium. [4 marks]");
  form.append("answer", "The subsidy lowers producer costs and shifts supply right.");
  if (options.includeKeys !== false) {
    form.append("idempotencyKey", KEY);
    form.append("attemptOperationKey", OPERATION_KEY);
  }
  if (options.extra) form.append("mark", "7");
  return new Request("http://localhost/api/diagram", { method: "POST", body: form });
}

const GOOD_OUTPUT = {
  status: "completed",
  output_text: JSON.stringify({
    status: "reviewed_clearly",
    graphTypeObserved: "demand and supply",
    relevanceToQuestion: "appears_relevant",
    elements: [{ element: "axes_labels", observed: "visible" }],
    consistencyWithAnswer: "supports",
    improvements: ["Label the new equilibrium."],
  }),
};

beforeEach(() => {
  state.claims = { sub: USER_ID };
  state.outcome = "reserved";
  vi.clearAllMocks();
  reserve.mockImplementation(async () => ({
    outcome: state.outcome,
    reservationId: state.outcome === "reserved" ? RESERVATION_ID : null,
    status: state.outcome === "reserved" ? "reserved" : null,
    relatedAttemptId: null,
    relatedPracticeId: null,
    resultHash: null,
  }));
  openaiCreate.mockResolvedValue(GOOD_OUTPUT);
});

describe("POST /api/diagram feedback-only reservation", () => {
  it("authenticates and enforces exact contextual multipart input before reserving", async () => {
    state.claims = null;
    expect((await POST(request())).status).toBe(401);
    state.claims = { sub: USER_ID };
    expect((await POST(request({ includeKeys: false }))).status).toBe(400);
    expect((await POST(request({ extra: true }))).status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("binds the diagram reservation to the grade operation and never redispatches a key", async () => {
    await POST(request());
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "diagram",
        idempotencyKey: KEY,
        operationGroupKey: OPERATION_KEY,
      })
    );
    vi.clearAllMocks();
    state.outcome = "replay";
    expect((await POST(request())).status).toBe(409);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("dispatches once with store:false and stores only a result hash on the reservation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reservationId).toBe(RESERVATION_ID);
    expect(body.evidence.version).toBe(1);
    expect(openaiCreate.mock.calls[0][0]).toMatchObject({ store: false });
    expect(succeeded).toHaveBeenCalledWith(
      RESERVATION_ID,
      USER_ID,
      { resultHash: expect.stringMatching(/^[0-9a-f]{64}$/) }
    );
    expect(JSON.stringify(succeeded.mock.calls)).not.toContain("demand and supply");
  });

  it("fails closed and counts output containing marks or unexpected fields", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openaiCreate.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
        status: "reviewed_clearly",
        graphTypeObserved: "demand and supply",
        relevanceToQuestion: "appears_relevant",
        elements: [{ element: "axes_labels", observed: "visible" }],
        consistencyWithAnswer: "supports",
        improvements: ["Label the new equilibrium."],
        mark: 4,
      }),
    });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(failed).toHaveBeenCalledWith(RESERVATION_ID, USER_ID, "validation");
    expect(succeeded).not.toHaveBeenCalled();
  });

  it("marks provider failures as counted without exposing private context", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openaiCreate.mockRejectedValue(new Error("private diagram context"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(failed).toHaveBeenCalledWith(RESERVATION_ID, USER_ID, "provider");
    expect(JSON.stringify(await response.json())).not.toContain("private diagram context");
  });
});
