import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "@/lib/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  state: {
    claims: { sub: "11111111-1111-4111-8111-111111111111" } as Record<
      string,
      unknown
    > | null,
    reservation: {} as Record<string, unknown>,
  },
  openaiCreate: vi.fn(),
  reserve: vi.fn(),
  processing: vi.fn(async () => {}),
  succeeded: vi.fn(async () => {}),
  failed: vi.fn(async () => {}),
  save: vi.fn(),
  findById: vi.fn(),
  findByKey: vi.fn(),
}));
const { state, openaiCreate, reserve, succeeded, failed, save, findById, findByKey } = mocks;

const ATTEMPT = {
  id: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-07-10T10:00:00.000Z",
  subject: "Economics",
  topic: "Government intervention",
  question: "Evaluate a tariff. [15 marks]",
  answer: "A developed answer.",
  feedback: {
    score: 5,
    band: "Strong 5",
    strengths: ["Clear chain."],
    improvements: ["Evaluate further."],
    mistakes: [],
    examinerComment: "Sound.",
    studyNext: "Evaluation.",
  },
  assessment: { topicLabel: "Government intervention", sourceMaterialProvided: false },
  parentAttemptId: null,
  practiceQuestionId: null,
  sourceMaterial: null,
  diagramEvidence: null,
} as unknown as Attempt;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.state.claims } }) },
    from: vi.fn(),
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
vi.mock("@/lib/supabase/server-authority", () => ({
  saveGradeAttempt: mocks.save,
  findAttemptById: mocks.findById,
  findAttemptByIdempotency: mocks.findByKey,
}));
vi.mock("@/lib/ai/assessment-schema", () => ({
  GRADE_RESULT_JSON_SCHEMA: { type: "object" },
  buildAssessmentInstructions: () => "grade only the written answer",
  buildAssessmentUserInput: () => "student text",
  validateGradeResult: () => ({
    feedback: {
      score: 5,
      band: "Strong 5",
      strengths: ["Clear chain."],
      improvements: ["Evaluate further."],
      mistakes: [],
      examinerComment: "Sound.",
      studyNext: "Evaluation.",
    },
    assessment: { topicLabel: "Government intervention", sourceMaterialProvided: false },
  }),
}));

import { POST } from "./route";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: "Economics",
      topic: "Economics",
      question: ATTEMPT.question,
      answer: ATTEMPT.answer,
      requestedSource: null,
      requestedTotal: null,
      templateId: null,
      requestedFramework: null,
      sourceMaterial: null,
      practiceQuestionId: null,
      parentAttemptId: null,
      idempotencyKey: KEY,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  state.claims = { sub: USER_ID };
  state.reservation = {
    outcome: "reserved",
    reservationId: "33333333-3333-4333-8333-333333333333",
    status: "reserved",
    relatedAttemptId: null,
    relatedPracticeId: null,
    resultHash: null,
  };
  vi.clearAllMocks();
  reserve.mockImplementation(async () => state.reservation);
  openaiCreate.mockResolvedValue({ status: "completed", output_text: "{}" });
  save.mockResolvedValue(ATTEMPT);
  findById.mockResolvedValue(null);
  findByKey.mockResolvedValue(null);
});

describe("POST /api/grade server authority", () => {
  it("authenticates before reservation or provider work", async () => {
    state.claims = null;
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(reserve).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown fields, invalid keys, and an overlong topic before reserving", async () => {
    for (const body of [
      { idempotencyKey: "not-a-uuid" },
      { forged: true },
      { topic: "x".repeat(81) },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(reserve).not.toHaveBeenCalled();
  });

  it("returns quota/in-progress outcomes without dispatch", async () => {
    for (const [outcome, expected] of [
      ["limited", 429],
      ["in_progress", 409],
      ["conflict", 409],
    ] as const) {
      state.reservation = { ...state.reservation, outcome, reservationId: null };
      expect((await POST(request())).status).toBe(expected);
    }
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("replays the durable saved attempt without a second provider call", async () => {
    state.reservation = { ...state.reservation, outcome: "replay", relatedAttemptId: ATTEMPT.id };
    findById.mockResolvedValue(ATTEMPT);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).attempt.id).toBe(ATTEMPT.id);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("dispatches once with store:false, persists server-side, and links the reservation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate.mock.calls[0][0]).toMatchObject({ store: false });
    expect(save).toHaveBeenCalledWith(
      USER_ID,
      KEY,
      expect.objectContaining({ question: ATTEMPT.question, answer: ATTEMPT.answer })
    );
    expect(save.mock.calls[0][2]).not.toHaveProperty("diagramEvidence");
    expect(succeeded).toHaveBeenCalledWith(
      state.reservation.reservationId,
      USER_ID,
      { attemptId: ATTEMPT.id }
    );
  });

  it("marks a dispatched provider failure as counted and returns no content", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openaiCreate.mockRejectedValue(new Error("provider failure with private text"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(failed).toHaveBeenCalledWith(state.reservation.reservationId, USER_ID, "provider");
    expect(JSON.stringify(await response.json())).not.toContain("private text");
  });
});
