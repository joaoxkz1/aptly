import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuestion } from "@/lib/types";
import type { SavedPracticeInput } from "@/lib/supabase/server-authority";
import type { UsageReservation } from "@/lib/ai/usage-reservations";
import { ECONOMICS_QUESTION_BANK } from "@/lib/assessment/question-bank/economics-v1";
import { WRITTEN_ONLY_DIAGRAM_POLICY } from "@/lib/assessment/question-bank/economics-v1/types";
import { createPracticeGenerationClient } from "@/lib/ai/practice-request";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST = { marks: 10 as const, topicCode: "2.7", context: "general" as const, regenerate: true };
const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  acknowledge: vi.fn(),
  saved: new Map<string, PracticeQuestion>(),
  ledger: new Map<string, { fingerprint: string; status: "reserved" | "processing" | "succeeded" | "failed" }>(),
  requestKeys: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: {
    claims: { sub: "11111111-1111-4111-8111-111111111111", user_metadata: { economics_level: "sl" } },
  } }) } }),
}));
vi.mock("@/lib/supabase/attempts", () => ({ fetchAttempts: async () => [] }));
vi.mock("@/lib/ai/openai", () => ({ getOpenAI: () => ({ responses: { create: mocks.provider } }) }));
vi.mock("@/lib/ai/usage-reservations", () => ({
  reserveAIUsage: async (input: { idempotencyKey: string; fingerprint: string; dailyLimit: number }): Promise<UsageReservation> => {
    const row = mocks.ledger.get(input.idempotencyKey);
    const outcome = row
      ? row.fingerprint !== input.fingerprint ? "conflict" : row.status === "failed" ? "failed" : row.status === "succeeded" ? "replay" : "in_progress"
      : mocks.ledger.size >= input.dailyLimit ? "limited" : "reserved";
    if (outcome === "reserved") mocks.ledger.set(input.idempotencyKey, { fingerprint: input.fingerprint, status: "reserved" });
    return { outcome, reservationId: outcome === "limited" ? null : input.idempotencyKey,
      status: row?.status ?? "reserved", relatedAttemptId: null, relatedPracticeId: null, resultHash: null };
  },
  markReservationProcessing: async (key: string) => { mocks.ledger.get(key)!.status = "processing"; },
  markReservationSucceeded: async (key: string) => {
    await mocks.acknowledge();
    mocks.ledger.get(key)!.status = "succeeded";
  },
  markReservationFailed: async (key: string) => { mocks.ledger.get(key)!.status = "failed"; },
}));
vi.mock("@/lib/supabase/server-authority", () => ({
  PracticeIdempotencyConflictError: class extends Error {},
  findPracticeByIdempotency: async (_userId: string, key: string) => mocks.saved.get(key) ?? null,
  fetchLatestTrustedPracticeQuestion: async () => null,
  fetchPracticeBankHistory: async () => ECONOMICS_QUESTION_BANK
    .filter(question => question.topicCode === "2.7" && question.marks === 10)
    .map(question => ({ bankQuestionId: question.id, createdAt: "2026-09-06T10:00:00Z" })),
  savePracticeQuestion: async (userId: string, key: string, input: SavedPracticeInput): Promise<PracticeQuestion> => {
    expect(userId).toBe(USER_ID);
    expect(mocks.saved.has(key)).toBe(false);
    const question: PracticeQuestion = {
      id: crypto.randomUUID(), createdAt: "2026-09-06T10:00:00Z", question: input.question,
      sourceMaterial: input.sourceMaterial, framework: "paper1a_10_mark", markTotal: input.markTotal,
      topicCode: input.topicCode, topicLabel: input.topicLabel, taxonomyVersion: "economics-2022-v1",
      skill: "economic_analysis", why: input.why, fromCurrentFocus: input.fromCurrentFocus, focus: input.focus ?? null,
    };
    mocks.saved.set(key, question);
    return question;
  },
}));

import { POST } from "./route";

// Exercise the real generator validator, bank-exhaustion path, route and client.
// Only the provider and durable storage/reservation boundaries are in memory.
const MODEL_OUTPUT = {
  topicCode: "2.7", taxonomyVersion: "economics-2022-v1", marks: 10,
  framework: "paper1a_10_mark", paper: "paper_1", questionPart: "a",
  levelRelevance: "shared_sl_hl", requiresSource: false, diagramDependent: false, origin: "adaptive_generated",
  question: "Explain how a subsidy to producers may affect market price and output. [10 marks]",
  commandTerm: "explain", targetSkills: ["economic_analysis"], angleTags: ["subsidy"],
  diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
  gradingBlueprint: {
    coreEconomicMeaning: null, acceptableAlternativeWording: [], distinctionsRequired: [],
    theoryAreas: ["Subsidies and supply."], analysisPaths: ["Trace lower production costs into supply, price and output."],
    applicationExpectations: ["Relevant examples may support explanation."], evaluationDirections: ["Evaluation is not required."],
    validAlternativeApproaches: ["Credit alternative valid economic reasoning."], commonMisconceptions: ["Consumers receive the full subsidy."],
    notes: ["Non-exhaustive guidance."],
  },
};

function client() {
  return createPracticeGenerationClient(async (_url, init) => {
    mocks.requestKeys.push((JSON.parse(init!.body as string) as { idempotencyKey: string }).idempotencyKey);
    return POST(new Request("http://localhost/api/practice", init));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.saved.clear(); mocks.ledger.clear(); mocks.requestKeys.length = 0;
  mocks.provider.mockResolvedValue({ status: "completed", output_text: JSON.stringify(MODEL_OUTPUT) });
  mocks.acknowledge.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("Practice retry identity across the client, route and durable boundaries", () => {
  it("recovers a persisted question after acknowledgement failure without another provider operation or row", async () => {
    mocks.acknowledge.mockRejectedValueOnce(new Error("simulated acknowledgement failure"));
    const generation = client();
    expect((await generation.request(REQUEST)).status).toBe(502);
    expect(mocks.saved.size).toBe(1);
    const savedQuestion = [...mocks.saved.values()][0];
    const result = await generation.request(REQUEST);
    expect(result.practiceQuestion?.id).toBe(savedQuestion.id);
    expect(result.reused).toBe(true);
    expect(new Set(mocks.requestKeys).size).toBe(1);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(mocks.saved.size).toBe(1);
    expect(mocks.ledger.size).toBe(1);
  });

  it.each(["provider outage", "invalid model output"])("reconciles %s before an explicit fresh retry; every reserved operation remains counted", async (failure) => {
    if (failure === "provider outage") {
      mocks.provider.mockRejectedValueOnce(new Error("transient outage")).mockRejectedValueOnce(new Error("transient outage"));
    } else {
      mocks.provider.mockResolvedValueOnce({ status: "completed", output_text: "{}" })
        .mockResolvedValueOnce({ status: "completed", output_text: "{}" });
    }
    const generation = client();
    expect((await generation.request(REQUEST)).status).toBe(502);
    const terminal = await generation.request(REQUEST);
    expect(terminal).toMatchObject({ status: 409, code: "request_failed", practiceQuestion: null });
    expect(new Set(mocks.requestKeys).size).toBe(1);
    expect(mocks.provider).toHaveBeenCalledTimes(2); // Existing single-operation validation/provider retry.
    expect(mocks.saved.size).toBe(0);
    expect(mocks.ledger.size).toBe(1);

    const retry = generation.request(REQUEST); // Explicit action; no automatic dispatch on terminal response.
    const doubleClick = generation.request(REQUEST);
    expect((await retry).status).toBe(200);
    expect(await doubleClick).toEqual(await retry);
    expect(mocks.requestKeys[2]).not.toBe(mocks.requestKeys[1]);
    expect(mocks.provider).toHaveBeenCalledTimes(3);
    expect(mocks.saved.size).toBe(1);
    expect([...mocks.ledger.values()].map(row => row.status).sort()).toEqual(["failed", "succeeded"]);
  });
});
