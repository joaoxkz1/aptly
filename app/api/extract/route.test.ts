import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const RESERVATION_ID = "33333333-3333-4333-8333-333333333333";
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

function request(bytes = jpegBytes(), includeKey = true): Request {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes).buffer as ArrayBuffer]), "scan.jpg");
  if (includeKey) form.append("idempotencyKey", KEY);
  return new Request("http://localhost/api/extract", { method: "POST", body: form });
}

const GOOD_OUTPUT = {
  status: "completed",
  output_text: JSON.stringify({
    question: "Explain how a subsidy affects equilibrium. [4 marks]",
    answer: "A subsidy lowers costs and shifts supply right.",
    sourceMaterial: null,
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

describe("POST /api/extract atomic transcription", () => {
  it("authenticates and validates exact multipart input before reserving", async () => {
    state.claims = null;
    expect((await POST(request())).status).toBe(401);
    state.claims = { sub: USER_ID };
    expect((await POST(request(jpegBytes(), false))).status).toBe(400);
    expect((await POST(request(new TextEncoder().encode("not an image")))).status).toBe(415);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("does not dispatch when limited, in progress, or already completed", async () => {
    for (const [outcome, status] of [
      ["limited", 429],
      ["in_progress", 409],
      ["replay", 409],
    ] as const) {
      state.outcome = outcome;
      expect((await POST(request())).status).toBe(status);
    }
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("dispatches once with store:false and returns transcription only", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["extracted"]);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate.mock.calls[0][0]).toMatchObject({ store: false });
    expect(succeeded).toHaveBeenCalledWith(RESERVATION_ID, USER_ID);
  });

  it("counts an unreadable provider result without retaining or replaying it", async () => {
    openaiCreate.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({ question: null, answer: null, sourceMaterial: null }),
    });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(succeeded).toHaveBeenCalledWith(RESERVATION_ID, USER_ID);
  });

  it("marks a dispatched provider failure failed and exposes no provider detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openaiCreate.mockRejectedValue(new Error("private scan text"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(failed).toHaveBeenCalledWith(RESERVATION_ID, USER_ID, "provider");
    expect(JSON.stringify(await response.json())).not.toContain("private scan text");
  });
});
