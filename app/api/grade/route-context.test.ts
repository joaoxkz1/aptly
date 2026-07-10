import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const PRACTICE_ID = "33333333-3333-4333-8333-333333333333";
const PARENT_ID = "44444444-4444-4444-8444-444444444444";
const RESERVATION_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  state: {
    practiceRow: null as Record<string, unknown> | null,
    practiceError: null as unknown,
    parentRow: null as Record<string, unknown> | null,
    parentError: null as unknown,
  },
  from: vi.fn(),
  openaiCreate: vi.fn(),
  reserve: vi.fn(),
  processing: vi.fn(async () => {}),
  succeeded: vi.fn(async () => {}),
  failed: vi.fn(async () => {}),
  save: vi.fn(),
  findById: vi.fn(),
  findByKey: vi.fn(),
}));

const { state, from, openaiCreate, reserve } = mocks;

function queryChain(result: () => { data: Record<string, unknown> | null; error: unknown }) {
  const chain = {
    eq: () => chain,
    maybeSingle: async () => result(),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER_ID } } }) },
    from: (table: string) => {
      mocks.from(table);
      return {
        select: () =>
          table === "practice_questions"
            ? queryChain(() => ({
                data: mocks.state.practiceRow,
                error: mocks.state.practiceError,
              }))
            : queryChain(() => ({
                data: mocks.state.parentRow,
                error: mocks.state.parentError,
              })),
      };
    },
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

import { POST } from "./route";

const QUESTION = "Evaluate the use of tariffs to protect infant industries. [15 marks]";
const ANSWER = "Tariffs raise import prices and may let infant industries scale.";
const RETAINED_SOURCE =
  "In 2024 Norvia raised fuel taxes by 12%; consumption fell 5% while low-income households reported energy arrears.";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: "Economics",
      topic: "Economics",
      question: QUESTION,
      answer: ANSWER,
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

function providerUserContent() {
  const providerRequest = openaiCreate.mock.calls[0][0] as {
    input: { role: string; content: string }[];
  };
  return providerRequest.input[1].content;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.practiceRow = null;
  state.practiceError = null;
  state.parentRow = null;
  state.parentError = null;
  vi.clearAllMocks();
  reserve.mockResolvedValue({
    outcome: "reserved",
    reservationId: RESERVATION_ID,
    status: "reserved",
    relatedAttemptId: null,
    relatedPracticeId: null,
    resultHash: null,
  });
  openaiCreate.mockRejectedValue(new Error("provider sentinel"));
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => errorSpy.mockRestore());

describe("POST /api/grade trusted relationship context", () => {
  it("uses the stored trusted Practice question, source, and framework instead of client text", async () => {
    const storedQuestion =
      "Using information from the text, discuss whether the excise tax benefits Norvia. [15 marks]";
    const storedSource =
      "Norvia introduced an excise tax; purchases fell and producers reduced sugar content.";
    state.practiceRow = {
      question: storedQuestion,
      source_material: storedSource,
      framework: "paper2g_15_mark",
      mark_total: 15,
      authority_version: 1,
    };

    await POST(
      request({
        practiceQuestionId: PRACTICE_ID,
        question: "Client-substituted question. [40 marks]",
        sourceMaterial: "Client-substituted source.",
        requestedSource: "user_confirmed",
        requestedTotal: 40,
        requestedFramework: "paper1b_15_mark",
      })
    );

    const content = providerUserContent();
    expect(content).toContain(storedQuestion);
    expect(content).toContain(storedSource);
    expect(content).toContain("paper2g_15_mark");
    expect(content).toContain("total 15 marks");
    expect(content).not.toContain("Client-substituted");
    expect(from.mock.invocationCallOrder[0]).toBeLessThan(
      reserve.mock.invocationCallOrder[0]
    );
  });

  it("rejects an unknown/not-owned trusted Practice id before reservation", async () => {
    const response = await POST(request({ practiceQuestionId: PRACTICE_ID }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(reserve).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("fails closed on an unsupported stored Practice framework", async () => {
    state.practiceRow = {
      question: "Explain the diagram. [4 marks]",
      source_material: null,
      framework: "paper2_four_mark_diagram_explain",
      mark_total: 4,
      authority_version: 1,
    };
    const response = await POST(request({ practiceQuestionId: PRACTICE_ID }));
    expect(response.status).toBe(502);
    expect(reserve).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("uses a retained parent source and ignores a client replacement", async () => {
    state.parentRow = {
      source_material: RETAINED_SOURCE,
      assessment: { framework: "paper3b_10_mark" },
    };
    await POST(
      request({
        question:
          "Paper 3(b): Using information from the text, recommend a policy to reduce fuel poverty. [10]",
        parentAttemptId: PARENT_ID,
        sourceMaterial: "Client replacement source.",
      })
    );
    const content = providerUserContent();
    expect(content).toContain(RETAINED_SOURCE);
    expect(content).toContain("paper3b_10_mark");
    expect(content).not.toContain("Client replacement source.");
  });

  it("keeps a source-less Paper 3(b) revision feedback-only", async () => {
    state.parentRow = {
      source_material: null,
      assessment: { framework: "paper3b_10_mark" },
    };
    await POST(
      request({
        question: "Using information from the text, recommend a policy to reduce fuel poverty.",
        parentAttemptId: PARENT_ID,
        requestedSource: "user_confirmed",
        requestedTotal: 10,
      })
    );
    const content = providerUserContent();
    expect(content).toContain("FEEDBACK ONLY");
    expect(content).not.toContain("ASSESSABLE 10");
  });

  it("accepts a one-time source re-paste for a legacy parent", async () => {
    state.parentRow = {
      source_material: null,
      assessment: { framework: "paper3b_10_mark" },
    };
    await POST(
      request({
        question:
          "Paper 3(b): Using information from the text, recommend a policy to reduce fuel poverty. [10]",
        parentAttemptId: PARENT_ID,
        sourceMaterial: RETAINED_SOURCE,
      })
    );
    const content = providerUserContent();
    expect(content).toContain(RETAINED_SOURCE);
    expect(content).toContain("paper3b_10_mark");
    expect(content).toContain("total 10 marks");
  });

  it("fails closed on a parent lookup error before reservation", async () => {
    state.parentError = new Error("local database unavailable");
    const response = await POST(request({ parentAttemptId: PARENT_ID }));
    expect(response.status).toBe(502);
    expect(reserve).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("gives trusted Practice context precedence over a parent source", async () => {
    state.practiceRow = {
      question: "Using information from the text, discuss the tax. [15 marks]",
      source_material: "Generated stimulus: output rose while emissions fell.",
      framework: "paper2g_15_mark",
      mark_total: 15,
      authority_version: 1,
    };
    state.parentRow = {
      source_material: RETAINED_SOURCE,
      assessment: { framework: "paper3b_10_mark" },
    };
    await POST(
      request({ practiceQuestionId: PRACTICE_ID, parentAttemptId: PARENT_ID })
    );
    const content = providerUserContent();
    expect(content).toContain("Generated stimulus");
    expect(content).not.toContain(RETAINED_SOURCE);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("practice_questions");
  });
});
