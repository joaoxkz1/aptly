import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuestion } from "@/lib/types";
import { ECONOMICS_QUESTION_BANK } from "@/lib/assessment/question-bank/economics-v1";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const RESERVATION_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  state: {
    claims: {
      sub: "11111111-1111-4111-8111-111111111111",
      user_metadata: { economics_level: "sl" },
    } as Record<string, unknown> | null,
    latest: null as PracticeQuestion | null,
    history: [] as { bankQuestionId: string | null; createdAt: string }[],
    replay: null as PracticeQuestion | null,
    reservation: {} as Record<string, unknown>,
  },
  openaiCreate: vi.fn(),
  reserve: vi.fn(),
  processing: vi.fn(async () => {}),
  succeeded: vi.fn(async () => {}),
  failed: vi.fn(async () => {}),
  save: vi.fn(),
  find: vi.fn(),
  validate: vi.fn(),
}));

const QUESTION = {
  id: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-08-18T10:00:00.000Z",
  question: "Explain how a producer subsidy may affect market price and output. [10 marks]",
  sourceMaterial: null,
  framework: "paper1a_10_mark",
  markTotal: 10,
  topicCode: "2.7",
  topicLabel: "Role of government in microeconomics",
  taxonomyVersion: "economics-2022-v1",
  skill: "economic_analysis",
  why: "You chose this topic.",
  fromCurrentFocus: false,
} as PracticeQuestion;

const BANK_ITEM = {
  id: "econ-v1-2.7-10-001",
  bankVersion: "economics-question-bank-v1",
  question: QUESTION.question,
  marks: 10,
  taxonomyVersion: "economics-2022-v1",
  topicCode: "2.7",
  unit: "unit_2",
  levelRelevance: "shared_sl_hl",
  framework: "paper1a_10_mark",
  paper: "paper_1",
  questionPart: "a",
  commandTerm: "explain",
  targetSkills: ["economic_analysis"],
  angleTags: ["subsidy"],
  diagramPolicy:
    "A diagram may support a written answer but is not required and is not assessed by this question.",
  gradingBlueprintVersion: "economics-grading-blueprint-v1",
  qualityStatus: "curated",
  gradingBlueprint: {
    kind: "extended",
    theoryAreas: ["Subsidies and supply"],
    analysisPaths: ["Trace lower costs into supply, price and output"],
    applicationExpectations: ["Examples optional"],
    evaluationDirections: ["Evaluation not required"],
    validAlternativeApproaches: ["Credit valid alternatives"],
    commonMisconceptions: ["Consumers receive the full subsidy"],
    diagramPolicy:
      "A diagram may support a written answer but is not required and is not assessed by this question.",
    notes: ["Non-exhaustive"],
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.state.claims } }) },
  }),
}));
vi.mock("@/lib/supabase/attempts", () => ({ fetchAttempts: async () => [] }));
vi.mock("@/lib/supabase/practice-questions", () => ({
  fetchLatestPracticeQuestion: async () => mocks.state.latest,
}));
vi.mock("@/lib/ai/openai", () => ({
  getOpenAI: () => ({ responses: { create: mocks.openaiCreate } }),
}));
vi.mock("@/lib/ai/practice-schema", () => ({
  PRACTICE_JSON_SCHEMA: { type: "object" },
  buildPracticeInstructions: () => "original written-only question",
  buildPracticeUserInput: () => "trusted target",
  validateGeneratedPractice: mocks.validate,
}));
vi.mock("@/lib/ai/usage-reservations", () => ({
  reserveAIUsage: mocks.reserve,
  markReservationProcessing: mocks.processing,
  markReservationSucceeded: mocks.succeeded,
  markReservationFailed: mocks.failed,
}));
vi.mock("@/lib/supabase/server-authority", () => {
  class PracticeIdempotencyConflictError extends Error {}
  return {
    PracticeIdempotencyConflictError,
    savePracticeQuestion: mocks.save,
    findPracticeByIdempotency: mocks.find,
    fetchPracticeBankHistory: async () => mocks.state.history,
  };
});

import { POST } from "./route";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marks: 10,
      topicCode: "2.7",
      context: "general",
      regenerate: false,
      idempotencyKey: KEY,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  mocks.state.claims = {
    sub: USER_ID,
    user_metadata: { economics_level: "sl" },
  };
  mocks.state.latest = null;
  mocks.state.history = [];
  mocks.state.replay = null;
  mocks.state.reservation = {
    outcome: "reserved",
    reservationId: RESERVATION_ID,
    status: "reserved",
    relatedAttemptId: null,
    relatedPracticeId: null,
    resultHash: null,
  };
  vi.clearAllMocks();
  mocks.find.mockImplementation(async () => mocks.state.replay);
  mocks.save.mockResolvedValue(QUESTION);
  mocks.reserve.mockImplementation(async () => mocks.state.reservation);
  mocks.openaiCreate.mockResolvedValue({ status: "completed", output_text: "{}" });
  mocks.validate.mockReturnValue({
    question: "Explain why a subsidy may increase output. [10 marks]",
    commandTerm: "explain",
    targetSkills: ["economic_analysis"],
    angleTags: ["subsidy"],
    gradingBlueprint: BANK_ITEM.gradingBlueprint,
  });
});

describe("POST /api/practice bank-first authority", () => {
  it("requires authentication, course level and an exact request shape", async () => {
    mocks.state.claims = null;
    expect((await POST(request())).status).toBe(401);
    mocks.state.claims = { sub: USER_ID, user_metadata: {} };
    expect((await POST(request())).status).toBe(409);
    mocks.state.claims = {
      sub: USER_ID,
      user_metadata: { economics_level: "sl" },
    };
    for (const invalid of [
      { marks: 4 },
      { topicCode: "legacy" },
      { context: "forged" },
      { framework: "paper3b_10_mark" },
      { courseLevel: "hl" },
    ]) {
      expect((await POST(request(invalid))).status).toBe(400);
    }
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("serves and persists a curated question without quota or provider work", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith(
      USER_ID,
      KEY,
      expect.objectContaining({
        questionOrigin: "curated_bank",
        bankQuestionId: expect.stringMatching(/^econ-v1-2\.7-10-/),
        framework: "paper1a_10_mark",
        markTotal: 10,
        topicCode: "2.7",
        gradingBlueprint: expect.objectContaining({ kind: "extended" }),
      })
    );
    expect(JSON.stringify(await response.json())).not.toContain("gradingBlueprint");
  });

  it("reopens only an unanswered question with the requested topic and marks", async () => {
    mocks.state.latest = QUESTION;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).reused).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("replays the same idempotent bank result before making another selection", async () => {
    mocks.state.replay = QUESTION;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).practiceQuestion.id).toBe(QUESTION.id);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("uses the existing GPT-5.4 quota path only after bank exhaustion", async () => {
    mocks.state.history = ECONOMICS_QUESTION_BANK.filter(
      (question) => question.topicCode === "2.7" && question.marks === 10
    ).map((question) => ({
      bankQuestionId: question.id,
      createdAt: "2026-08-18T00:00:00Z",
    }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(mocks.openaiCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.4",
      reasoning: { effort: "medium" },
      store: false,
    });
    expect(mocks.save).toHaveBeenCalledWith(
      USER_ID,
      KEY,
      expect.objectContaining({
        questionOrigin: "adaptive_generated",
        bankQuestionId: null,
        gradingBlueprint: BANK_ITEM.gradingBlueprint,
      })
    );
  });

  it("retries one invalid live output under the same quota reservation", async () => {
    mocks.state.history = ECONOMICS_QUESTION_BANK.filter(
      (question) => question.topicCode === "2.7" && question.marks === 10
    ).map((question) => ({
      bankQuestionId: question.id,
      createdAt: "2026-08-18T00:00:00Z",
    }));
    mocks.validate
      .mockImplementationOnce(() => {
        throw new Error("invalid generated structure");
      })
      .mockReturnValueOnce({
        question: "Explain why a subsidy may increase output. [10 marks]",
        commandTerm: "explain",
        targetSkills: ["economic_analysis"],
        angleTags: ["subsidy"],
        gradingBlueprint: BANK_ITEM.gradingBlueprint,
      });

    expect((await POST(request())).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("rejects SL requests for an HL-only top-level topic", async () => {
    for (const topicCode of ["2.4", "2.10"]) {
      const response = await POST(request({ topicCode }));
      expect(response.status).toBe(403);
    }
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("handles atomic live-generation limits without provider work", async () => {
    mocks.state.history = ECONOMICS_QUESTION_BANK.filter(
      (question) => question.topicCode === "2.7" && question.marks === 10
    ).map((question) => ({
      bankQuestionId: question.id,
      createdAt: "2026-08-18T00:00:00Z",
    }));
    mocks.state.reservation = {
      ...mocks.state.reservation,
      outcome: "limited",
      reservationId: null,
    };
    expect((await POST(request())).status).toBe(429);
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
  });
});
