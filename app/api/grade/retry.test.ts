import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "@/lib/types";
import type { SavedAttemptInput } from "@/lib/supabase/server-authority";
import type { UsageReservation } from "@/lib/ai/usage-reservations";
import { DraftSession, SessionDraftStore, type DraftStorage, type SubmissionDraftTicket } from "@/lib/drafts/session-draft";
import { classifyOperationOutcome } from "@/lib/ai/operation-outcome";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TEXT = {
  question: "Explain how a subsidy to producers may affect market price and output. [10 marks]",
  answer: "A subsidy lowers production costs, increasing supply. Market price falls and output rises.",
  source: "The government introduces a subsidy to domestic producers.",
};
const mocks = vi.hoisted(() => ({
  provider: vi.fn(), acknowledge: vi.fn(),
  saved: new Map<string, Attempt>(),
  ledger: new Map<string, { fingerprint: string; status: "reserved" | "processing" | "succeeded" | "failed" }>(),
  requestKeys: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: {
    claims: { sub: "11111111-1111-4111-8111-111111111111" },
  } }) } }),
}));
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
  findAttemptById: async (_userId: string, id: string) => [...mocks.saved.values()].find(attempt => attempt.id === id) ?? null,
  findAttemptByIdempotency: async (_userId: string, key: string) => mocks.saved.get(key) ?? null,
  fetchTrustedPracticeGuidance: async () => null,
  saveGradeAttempt: async (userId: string, key: string, input: SavedAttemptInput): Promise<Attempt> => {
    expect(userId).toBe(USER_ID);
    expect(mocks.saved.has(key)).toBe(false);
    const attempt: Attempt = { ...input, id: crypto.randomUUID(), createdAt: "2026-09-06T10:00:00Z", diagramEvidence: null };
    mocks.saved.set(key, attempt);
    return attempt;
  },
}));

import { POST } from "./route";

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

// Real econ-v4 validation remains in this connected flow; only paid/durable
// external boundaries are replaced. The output is a valid written-only answer.
const MODEL_OUTPUT = {
  strengths: ["Clear causal chain from costs to supply and price."], improvements: ["Develop the final market outcome."],
  mistakes: [], examinerComment: "Accurate economic analysis with some scope for development.", studyNext: "Practise explaining price and quantity changes.",
  assessmentFormat: "paper_1_a", paper: "paper_1", questionPart: "a", levelRelevance: "shared_sl_hl",
  assessmentSkills: ["economic_analysis"], commandTerm: "explain", commandTermLabel: "Explain",
  syllabusUnit: "unit_2", syllabusTopic: "2.7", topicLabel: "Role of government in microeconomics",
  classificationConfidence: "high", markingConfidence: "high", diagramExpected: false, diagramSubmitted: false,
  diagramAssessmentStatus: "not_relevant", workingsExpected: false, workingsSubmitted: false,
  workingsAssessmentStatus: "not_relevant", attachmentContent: "none", assessableEarned: 7,
  markBreakdown: [{ label: "Economic analysis", awarded: 3, available: 4, reason: "Clear causal explanation." }],
  bandRationale: "Relevant theory and a developed causal chain support this mark, with fuller development needed for the highest band.",
  limitations: [],
};

let store: SessionDraftStore;
function openDraft() { const draft = new DraftSession(USER_ID, "manual", store); draft.open(); return draft; }
async function submit(draft: DraftSession): Promise<{ response: Response; body: { error?: string; attempt?: Attempt }; ticket: SubmissionDraftTicket }> {
  const request = {
    subject: "Economics", topic: "Economics", question: draft.text.question, answer: draft.text.answer,
    sourceMaterial: draft.text.source, requestedSource: "explicit", requestedTotal: 10,
    requestedFramework: "paper1a_10_mark", parentAttemptId: null, practiceQuestionId: null,
  };
  const ticket = await draft.beginSubmission(JSON.stringify(request));
  mocks.requestKeys.push(ticket.idempotencyKey);
  const response = await POST(new Request("http://localhost/api/grade", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, idempotencyKey: ticket.idempotencyKey }),
  }));
  const body = await response.json() as { error?: string; attempt?: Attempt };
  const outcome = classifyOperationOutcome(response.status, body.error, Boolean(body.attempt?.id));
  if (outcome === "terminal_failed") draft.markTerminalFailure(ticket);
  if (outcome === "completed") draft.saved(ticket);
  return { response, body, ticket };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.saved.clear(); mocks.ledger.clear(); mocks.requestKeys.length = 0;
  mocks.provider.mockResolvedValue({ status: "completed", output_text: JSON.stringify(MODEL_OUTPUT) });
  mocks.acknowledge.mockResolvedValue(undefined);
  const storage = new MemoryStorage();
  store = new SessionDraftStore(() => storage);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("Grade retry identity across drafts, route, validation and durable boundaries", () => {
  it.each([false, true])("reconciles failure and waits for an explicit fresh retry, retaining unchanged text (reload: %s)", async (reload) => {
    mocks.provider.mockRejectedValueOnce(new Error("transient provider outage"));
    let draft = openDraft(); draft.edit(TEXT);
    expect((await submit(draft)).response.status).toBe(502);
    const terminal = await submit(draft);
    expect(terminal.response.status).toBe(409);
    expect(terminal.body.error).toBe("request_failed");
    expect(draft.text).toEqual(TEXT);
    expect(draft.getSnapshot().terminalFailed).toBe(true);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(mocks.saved.size).toBe(0);
    expect(new Set(mocks.requestKeys).size).toBe(1);
    if (reload) { draft.close(); draft = openDraft(); }
    expect(draft.text).toEqual(TEXT);
    expect(draft.getSnapshot().terminalFailed).toBe(true);
    expect(mocks.ledger.size).toBe(1); // Reconciliation/reload did not reserve or dispatch again.

    const recovered = await submit(draft); // The student's explicit next action.
    expect(recovered.response.status).toBe(200);
    expect(recovered.body.attempt?.answer).toBe(TEXT.answer);
    expect(mocks.requestKeys[2]).not.toBe(mocks.requestKeys[1]);
    expect(mocks.provider).toHaveBeenCalledTimes(2);
    expect(mocks.saved.size).toBe(1);
    expect([...mocks.ledger.values()].map(row => row.status).sort()).toEqual(["failed", "succeeded"]);
    expect(store.read(USER_ID, "manual").draft).toBeNull();
  });

  it("reloads an uncertain draft and replays the persisted attempt after acknowledgement failure", async () => {
    mocks.acknowledge.mockRejectedValueOnce(new Error("lost reservation acknowledgement"));
    const initial = openDraft(); initial.edit(TEXT);
    expect((await submit(initial)).response.status).toBe(502);
    expect(mocks.saved.size).toBe(1);
    const saved = [...mocks.saved.values()][0];
    initial.close();
    const restored = openDraft();
    expect(restored.text).toEqual(TEXT);
    const replay = await submit(restored);
    expect(replay.response.status).toBe(200);
    expect(replay.body.attempt?.id).toBe(saved.id);
    expect(new Set(mocks.requestKeys).size).toBe(1);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(mocks.saved.size).toBe(1);
    expect(mocks.ledger.size).toBe(1);
    expect(store.read(USER_ID, "manual").draft).toBeNull();
  });
});
