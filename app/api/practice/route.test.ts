import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt, PracticeQuestion } from "@/lib/types";
import { focusHistory, focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import { learningLoopAttempt } from "@/lib/testing/learning-loop-fixtures";
import { answerPracticeFocus } from "@/lib/assessment/focused-practice";
import { ECONOMICS_QUESTION_BANK } from "@/lib/assessment/question-bank/economics-v1";
import { requestFingerprint } from "@/lib/ai/request-integrity";

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
    attempts: [] as Attempt[],
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
vi.mock("@/lib/supabase/attempts", () => ({ fetchAttempts: async () => mocks.state.attempts }));
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
    fetchLatestTrustedPracticeQuestion: async () => mocks.state.latest ? { question: mocks.state.latest, targetSkills: [mocks.state.latest.skill], levelRelevance: "shared_sl_hl" } : null,
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));
  mocks.state.claims = {
    sub: USER_ID,
    user_metadata: { economics_level: "sl" },
  };
  mocks.state.latest = null;
  mocks.state.history = [];
  mocks.state.replay = null;
  mocks.state.attempts = [];
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
afterEach(() => vi.useRealTimers());

describe("verified focused Practice", () => {
  const focused = { context: "current_focus", marks: 15, topicCode: "2.8" };
  function exhaustApplication() {
    mocks.state.history = ECONOMICS_QUESTION_BANK.filter(q => q.topicCode === "2.8" && q.marks === 15 && q.targetSkills.includes("application"))
      .map(q => ({ bankQuestionId: q.id, createdAt: "2026-08-18" }));
    mocks.validate.mockReturnValue({ question: "Using real-world examples, evaluate policies to reduce negative production externalities. [15 marks]", commandTerm: "evaluate", targetSkills: ["economic_analysis", "application", "evaluation"], angleTags: ["externality"], gradingBlueprint: BANK_ITEM.gradingBlueprint });
  }
  beforeEach(() => { mocks.state.attempts = focusHistory(); });
  it.each([
    ["analysis", false], ["analysis", true], ["evaluation", false], ["evaluation", true],
  ] as const)("the audited %s priority survives the route and saved focus (API fallback: %s)", async (scenario, exhausted) => {
    const answer = learningLoopAttempt(scenario);
    answer.id = "77777777-7777-4777-8777-777777777777";
    const focus = answerPracticeFocus(answer)!;
    const skill = scenario === "analysis" ? "economic_analysis" : "evaluation";
    mocks.state.attempts.push(answer);
    const compatible = ECONOMICS_QUESTION_BANK.filter(q => q.topicCode === focus.topicCode &&
      q.marks === focus.recommendedMarks && q.targetSkills.includes(skill));
    expect(compatible.length).toBeGreaterThan(0);
    if (exhausted) {
      mocks.state.history = compatible.map(q => ({ bankQuestionId: q.id, createdAt: "2026-08-18" }));
      mocks.validate.mockReturnValue(compatible[0]); // Validator itself is exercised with real outputs in practice-schema.test.
    }
    expect((await POST(request({ context: "answer_feedback", sourceAttemptId: answer.id,
      marks: focus.recommendedMarks, topicCode: focus.topicCode }))).status).toBe(200);
    expect(mocks.save.mock.calls[0][2]).toMatchObject({
      skill: focus.targetSkill, markTotal: focus.recommendedMarks, topicCode: focus.topicCode,
      fromCurrentFocus: false, questionOrigin: exhausted ? "adaptive_generated" : "curated_bank",
      targetSkills: expect.arrayContaining([focus.targetSkill]),
      focus: { ...focus, serverVerified: true, courseLevel: "sl" },
    });
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(exhausted ? 1 : 0);
    if (exhausted) expect(mocks.validate.mock.calls[0][1]).toMatchObject({
      targetSkill: focus.targetSkill, topicCode: focus.topicCode, markTotal: focus.recommendedMarks, evidenceQuestion: answer.question,
    });
  });
  it("serves Application at 15 marks with truthful primary skill and no reservation", async () => {
    expect((await POST(request(focused))).status).toBe(200);
    expect(mocks.save.mock.calls[0][2]).toMatchObject({ skill: "application", markTotal: 15, framework: "paper1b_15_mark", fromCurrentFocus: true, targetSkills: expect.arrayContaining(["application"]), focus: { source: "current_focus", serverVerified: true, targetSkill: "application", courseLevel: "sl" } });
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.openaiCreate).not.toHaveBeenCalled();
  });
  it("uses AI after matching questions are exhausted despite unrelated unseen bank questions", async () => {
    exhaustApplication();
    expect((await POST(request(focused))).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(mocks.reserve.mock.calls[0][0]).toMatchObject({ capability: "practice", userId: USER_ID, idempotencyKey: KEY });
    expect(mocks.save.mock.calls[0][2]).toMatchObject({ questionOrigin: "adaptive_generated", skill: "application", bankQuestionId: null, focus: { source: "current_focus" }, generationProvenance: { modelId: "gpt-5.4", reasoningEffort: "medium", schemaHash: expect.stringMatching(/^[0-9a-f]{64}$/) } });
  });
  it("uses AI for a relevant definition with no concept-compatible bank match", async () => {
    mocks.state.attempts = focusHistory("Knowledge and terminology");
    mocks.state.attempts.forEach(a => { a.question = "Explain an unfamiliar narrowly specified concept. [10 marks]"; });
    mocks.validate.mockReturnValue({ question: "Define a negative externality of production. [2 marks]", targetSkills: ["definition"], commandTerm: "define", angleTags: ["externality"], gradingBlueprint: BANK_ITEM.gradingBlueprint });
    expect((await POST(request({ ...focused, marks: 2 }))).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });
  it("verifies feedback against its own saved answer, not global focus", async () => {
    const answer = focusAttempt("Economic analysis", "3.5", "77777777-7777-4777-8777-777777777777");
    mocks.state.attempts.push(answer);
    expect((await POST(request({ context: "answer_feedback", sourceAttemptId: answer.id, marks: 10, topicCode: "3.5" }))).status).toBe(200);
    expect(mocks.save.mock.calls[0][2]).toMatchObject({ skill: "economic_analysis", fromCurrentFocus: false, focus: { source: "answer_feedback", sourceAttemptId: answer.id, topicCode: "3.5" } });
  });
  it("rejects client-forged guidance, skill, provenance and unsupported source claims", async () => {
    for (const forged of [{ targetSkill: "evaluation" }, { focus: { serverVerified: true } }, { focusSource: "current_focus" }, { bankQuestionId: "forged" }, { questionOrigin: "curated_bank" }, { gradingBlueprint: {} }, { taxonomyVersion: "economics-2022-v1" }, { framework: "paper1b_15_mark" }, { levelRelevance: "hl_only" }]) {
      expect((await POST(request({ ...focused, ...forged }))).status).toBe(400);
    }
    expect((await POST(request({ ...focused, context: "answer_feedback", sourceAttemptId: USER_ID }))).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("rejects unsupported and stale focus instead of substituting an essay", async () => {
    expect((await POST(request({ ...focused, marks: 10 }))).status).toBe(409);
    mocks.state.attempts = focusHistory("Data use");
    const result = await POST(request(focused));
    expect((await result.json()).error).toBe("unsupported_focus");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("does not reuse an old focus boolean or a different source", async () => {
    mocks.state.latest = { ...QUESTION, topicCode: "2.8", markTotal: 15, framework: "paper1b_15_mark", skill: "application", fromCurrentFocus: true };
    expect((await POST(request(focused))).status).toBe(200); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("retries invalid output once under one reservation and saves only the valid result", async () => {
    exhaustApplication(); mocks.validate.mockImplementationOnce(() => { throw new Error("wrong skill"); });
    expect((await POST(request(focused))).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.openaiCreate).toHaveBeenCalledTimes(2); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("exhausted validation retries return an honest failure with no saved row", async () => {
    exhaustApplication(); mocks.validate.mockImplementation(() => { throw new Error("raw private model detail"); });
    const response = await POST(request(focused));
    expect(response.status).toBe(502); expect((await response.json()).error).toBe("focused_generation_failed");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.failed).toHaveBeenCalledWith(RESERVATION_ID, USER_ID, "validation");
  });
  it("an in-progress duplicate cannot dispatch another model operation", async () => {
    exhaustApplication();
    let finish!: (value: unknown) => void;
    mocks.openaiCreate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = POST(request(focused));
    await vi.waitFor(() => expect(mocks.openaiCreate).toHaveBeenCalledTimes(1));
    mocks.reserve.mockResolvedValueOnce({ outcome: "in_progress", reservationId: RESERVATION_ID });
    expect((await POST(request(focused))).status).toBe(409);
    finish({ status: "completed", output_text: "{}" });
    expect((await first).status).toBe(200); expect(mocks.openaiCreate).toHaveBeenCalledTimes(1); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("replays an existing focused result with its immutable original metadata", async () => {
    mocks.state.replay = { ...QUESTION, focus: { source: "answer_feedback", sourceAttemptId: USER_ID, topicCode: "2.7", targetSkill: "economic_analysis", taxonomyVersion: "economics-2022-v1", recommendedMarks: 10, courseLevel: "sl", explanation: "Stored reason", serverVerified: true } };
    expect((await (await POST(request(focused))).json()).practiceQuestion).toEqual(mocks.state.replay);
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
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
    expect(mocks.find).toHaveBeenCalledWith(USER_ID, KEY, requestFingerprint({ marks: 10, topicCode: "2.7", context: "general", regenerate: false, courseLevel: "sl" }));
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
