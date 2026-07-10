import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuestion } from "@/lib/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  state: {
    claims: { sub: "11111111-1111-4111-8111-111111111111" } as Record<
      string,
      unknown
    > | null,
    reusable: null as PracticeQuestion | null,
    reservation: {} as Record<string, unknown>,
  },
  openaiCreate: vi.fn(),
  reserve: vi.fn(),
  processing: vi.fn(async () => {}),
  succeeded: vi.fn(async () => {}),
  failed: vi.fn(async () => {}),
  save: vi.fn(),
  find: vi.fn(),
}));
const { state, openaiCreate, reserve, succeeded, save, find } = mocks;
const QUESTION = {
  id: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-07-10T10:00:00.000Z",
  question: "Evaluate whether a carbon tax reduces emissions. [15 marks]",
  sourceMaterial: null,
  framework: "generic_practice",
  markTotal: 15,
  topicCode: "2.8",
  topicLabel: "Market failure",
  skill: "evaluation",
  why: "Evaluation is the next focus.",
} as PracticeQuestion;
const TARGET = {
  framework: "generic_practice",
  markTotal: 15,
  topicCode: "2.8",
  topicLabel: "Market failure",
  skill: "evaluation",
  why: "Evaluation is the next focus.",
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.state.claims } }) },
  }),
}));
vi.mock("@/lib/supabase/attempts", () => ({ fetchAttempts: async () => [] }));
vi.mock("@/lib/supabase/practice-questions", () => ({
  fetchLatestPracticeQuestion: async () => mocks.state.reusable,
}));
vi.mock("@/lib/assessment/practice-reuse", () => ({
  reusablePracticeQuestion: () => mocks.state.reusable,
}));
vi.mock("@/lib/assessment/practice-target", () => ({
  derivePracticeTarget: () => ({
    framework: "generic_practice",
    markTotal: 15,
    topicCode: "2.8",
    topicLabel: "Market failure",
    skill: "evaluation",
    why: "Evaluation is the next focus.",
  }),
}));
vi.mock("@/lib/ai/openai", () => ({
  getOpenAI: () => ({ responses: { create: mocks.openaiCreate } }),
}));
vi.mock("@/lib/ai/practice-schema", () => ({
  PRACTICE_JSON_SCHEMA: { type: "object" },
  buildPracticeInstructions: () => "generate original practice",
  buildPracticeUserInput: () => "server target",
  validateGeneratedPractice: () => ({
    question: "Evaluate whether a carbon tax reduces emissions. [15 marks]",
    sourceMaterial: null,
  }),
}));
vi.mock("@/lib/ai/usage-reservations", () => ({
  reserveAIUsage: mocks.reserve,
  markReservationProcessing: mocks.processing,
  markReservationSucceeded: mocks.succeeded,
  markReservationFailed: mocks.failed,
}));
vi.mock("@/lib/supabase/server-authority", () => ({
  savePracticeQuestion: mocks.save,
  findPracticeByIdempotency: mocks.find,
}));

import { POST } from "./route";

function request(body: unknown = { regenerate: false, idempotencyKey: KEY }) {
  return new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.claims = { sub: USER_ID };
  state.reusable = null;
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
  save.mockResolvedValue(QUESTION);
  find.mockResolvedValue(null);
});

describe("POST /api/practice server authority", () => {
  it("requires authentication and an exact request shape", async () => {
    state.claims = null;
    expect((await POST(request())).status).toBe(401);
    state.claims = { sub: USER_ID };
    for (const invalid of [
      { regenerate: "true", idempotencyKey: KEY },
      { regenerate: false, idempotencyKey: "bad" },
      { regenerate: false, idempotencyKey: KEY, topic: "forged" },
    ]) {
      expect((await POST(request(invalid))).status).toBe(400);
    }
    expect(reserve).not.toHaveBeenCalled();
  });

  it("reopens an unanswered trusted question before quota/provider work", async () => {
    state.reusable = QUESTION;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).reused).toBe(true);
    expect(reserve).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("handles atomic limit and in-progress outcomes without provider work", async () => {
    for (const [outcome, status] of [["limited", 429], ["in_progress", 409]] as const) {
      state.reservation = { ...state.reservation, outcome, reservationId: null };
      expect((await POST(request())).status).toBe(status);
    }
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("replays a durable result after a duplicate successful key", async () => {
    state.reservation = { ...state.reservation, outcome: "replay" };
    find.mockResolvedValue(QUESTION);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).practiceQuestion.id).toBe(QUESTION.id);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("dispatches once with store:false and persists through the authority helper", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate.mock.calls[0][0]).toMatchObject({ store: false });
    expect(save).toHaveBeenCalledWith(USER_ID, KEY, expect.objectContaining(TARGET));
    expect(succeeded).toHaveBeenCalledWith(
      state.reservation.reservationId,
      USER_ID,
      { practiceId: QUESTION.id }
    );
  });
});
