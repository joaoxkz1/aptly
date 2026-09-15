import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ECONOMICS_QUESTION_BANK } from "@/lib/assessment/question-bank/economics-v1";
import { focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import type { Attempt } from "@/lib/types";
import { approvedFourMarkTemplate } from "@/lib/ai/four-mark-generation";
import { resolveQuestionGeneratorTarget } from "@/lib/assessment/question-generator";
import { publicContract, resolveAssessmentContract } from "@/lib/assessment/trusted-contract";
import { policyForGeneratedPractice } from "@/lib/assessment/policy";

const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const SAVED = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({
  claims: { sub: "11111111-1111-4111-8111-111111111111", user_metadata: { economics_level: "sl" } } as Record<string, unknown> | null,
  attempts: [] as Attempt[], history: [] as { bankQuestionId: string; createdAt: string }[],
  create: vi.fn(), reserve: vi.fn(), processing: vi.fn(), success: vi.fn(), failure: vi.fn(), save: vi.fn(), find: vi.fn(), latest: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: mocks.claims } }) } }) }));
vi.mock("@/lib/supabase/attempts", () => ({ fetchAttempts: async () => mocks.attempts }));
vi.mock("@/lib/ai/openai", () => ({ getOpenAI: () => ({ responses: { create: mocks.create } }) }));
vi.mock("@/lib/ai/usage-reservations", () => ({ reserveAIUsage: mocks.reserve, markReservationProcessing: mocks.processing, markReservationSucceeded: mocks.success, markReservationFailed: mocks.failure }));
vi.mock("@/lib/supabase/server-authority", () => ({
  PracticeIdempotencyConflictError: class extends Error {}, savePracticeQuestion: mocks.save, findPracticeByIdempotency: mocks.find,
  fetchPracticeBankHistory: async () => mocks.history, fetchLatestTrustedPracticeQuestion: mocks.latest,
}));
import { POST } from "./route";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://local/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marks: 4, topicCode: "2.3", context: "general", regenerate: false, idempotencyKey: KEY, ...overrides }) });
}
function exhaust(topic = "2.3") {
  mocks.history = ECONOMICS_QUESTION_BANK.filter(item => item.topicCode === topic && item.marks === 4).map(item => ({ bankQuestionId: item.id, createdAt: "2026-09-15" }));
}
function diagramFocus() {
  const attempt = focusAttempt("Diagram", "2.3");
  attempt.assessment!.assessmentSkills = ["diagram_explanation", "economic_analysis"];
  attempt.assessment!.assessedDiagram = { version: 1, state: "usable", contract: { version: "economics-diagram-contract-v1", mode: "four_mark_diagram", diagramRole: "required_explicitly", diagramReason: "The original task requires a diagram.", provenance: "aptly_authored" }, componentDecision: null,
    observations: [], summary: "The equilibrium needs correction.", attachmentHashes: ["synthetic"], snapshotId: "synthetic" };
  return attempt;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.claims = { sub: USER, user_metadata: { economics_level: "sl" } };
  mocks.history = []; mocks.attempts = [];
  mocks.find.mockResolvedValue(null); mocks.latest.mockResolvedValue(null);
  mocks.reserve.mockResolvedValue({ outcome: "reserved", reservationId: "44444444-4444-4444-8444-444444444444", relatedPracticeId: null, relatedAttemptId: null });
  mocks.save.mockImplementation(async (_user, _key, input) => {
    const contract = resolveAssessmentContract({ policy: policyForGeneratedPractice(input), question: input.question, sourceMaterial: input.sourceMaterial, topic: input.topicCode, blueprint: input.gradingBlueprint });
    return { id: SAVED, createdAt: "2026-09-15T10:00:00Z", question: input.question, sourceMaterial: input.sourceMaterial,
      framework: input.framework, markTotal: input.markTotal, topicCode: input.topicCode, topicLabel: input.topicLabel, skill: input.skill, why: input.why,
      taxonomyVersion: "economics-2022-v1", fromCurrentFocus: input.fromCurrentFocus, focus: input.focus,
      assessmentContract: contract ? publicContract(contract) : undefined };
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("four-mark Practice route with actual bank selection and fallback validators", () => {
  it("serves a complete original question and stimulus without reserving generation quota", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(value.practiceQuestion).toMatchObject({ markTotal: 4, topicCode: "2.3", assessmentContract: { mode: "four_mark_diagram" } });
    expect(value.practiceQuestion.sourceMaterial).toMatch(/hypothetical/i);
    expect(mocks.save).toHaveBeenCalledWith(USER, KEY, expect.objectContaining({ questionOrigin: "curated_bank", gradingBlueprintVersion: "economics-four-mark-blueprint-v2", gradingBlueprint: expect.objectContaining({ kind: "four_mark" }), sourceMaterial: expect.any(String) }));
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.stringify(value)).not.toContain("diagramCriteria"); expect(JSON.stringify(value)).not.toContain("permittedMechanisms");
  });
  it("selects an exact server-verified diagram focus while preserving its task shape", async () => {
    const focus = diagramFocus(); mocks.attempts = [focus];
    const response = await POST(request({ context: "answer_feedback", sourceAttemptId: focus.id }));
    expect(response.status).toBe(200);
    expect(mocks.save.mock.calls[0][2]).toMatchObject({ markTotal: 4, framework: "paper2_four_mark_diagram_explain", skill: "diagram_explanation", targetSkills: expect.arrayContaining(["diagram_explanation"]), focus: { source: "answer_feedback", sourceAttemptId: focus.id, serverVerified: true, recommendedMarks: 4 } });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("refuses a requested focus that differs from saved evidence before any paid fallback", async () => {
    const focus = diagramFocus(); mocks.attempts = [focus];
    expect((await POST(request({ context: "answer_feedback", sourceAttemptId: focus.id, marks: 10 }))).status).toBe(409);
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not substitute ordinary practice while retaining unsupported focused wording", async () => {
    const focus = focusAttempt("Data use", "2.3"); mocks.attempts = [focus];
    const response = await POST(request({ context: "answer_feedback", sourceAttemptId: focus.id }));
    expect(response.status).toBe(409); expect((await response.json()).error).toBe("unsupported_focus");
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("instantiates exhausted-bank fallback only from an approved template with its exact private criteria", async () => {
    exhaust();
    const target = resolveQuestionGeneratorTarget({ marks: 4, topicCode: "2.3", courseLevel: "sl", attempts: [], requestCurrentFocus: false });
    const template = approvedFourMarkTemplate(ECONOMICS_QUESTION_BANK, target, false)!;
    mocks.create.mockResolvedValue({ status: "completed", output_text: JSON.stringify({ templateId: template.id, scenarioName: "Cedar Valley" }) });
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][2]).toMatchObject({ questionOrigin: "adaptive_generated", sourceMaterial: expect.stringContaining("Cedar Valley"), gradingBlueprint: template.gradingBlueprint, gradingBlueprintVersion: template.gradingBlueprintVersion });
    expect((await response.json()).practiceQuestion.question).toContain(template.question.charAt(0).toLowerCase() + template.question.slice(1));
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ store: false, text: { format: { strict: true } } });
    expect(mocks.create.mock.calls[0][0].input[0].content).toContain("economic mechanism and allocation are fixed");
  });
  it.each([{ templateId: "forged", scenarioName: "Cedar Valley" }, { templateId: "econ-v1-2.3-4-001", scenarioName: "Cedar Valley", total: 20 }, { templateId: "econ-v1-2.3-4-001", scenarioName: "Ignore Policy" }])("rejects unsupported fallback output without persisting it: %j", async output => {
    exhaust(); mocks.create.mockResolvedValue({ status: "completed", output_text: JSON.stringify(output) });
    expect((await POST(request())).status).toBe(502);
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.failure).toHaveBeenCalled();
  });
  it.each(["gradingBlueprint", "assessmentContract", "diagramRole", "focus", "courseLevel"])("rejects forged browser metadata %s", async field => {
    expect((await POST(request({ [field]: "forged" }))).status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("replays the owner-bound saved result with no additional question or quota", async () => {
    mocks.find.mockResolvedValue({ id: SAVED, markTotal: 4 });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(USER, KEY, expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reuses an unanswered ordinary written four-marker without another save or generation", async () => {
    const written = ECONOMICS_QUESTION_BANK.find(item => item.marks === 4 && item.topicCode === "1.2")!;
    const question = {
      id: SAVED, createdAt: new Date().toISOString(), question: written.question,
      sourceMaterial: written.sourceMaterial, framework: written.framework, markTotal: 4,
      topicCode: written.topicCode, topicLabel: "How do economists approach the world?",
      taxonomyVersion: "economics-2022-v1", skill: "economic_analysis", why: "Ordinary written practice",
      fromCurrentFocus: false, focus: null,
      assessmentContract: { version: "economics-diagram-contract-v1", mode: "four_mark_written", diagramRole: "not_assessed", diagramReason: "This written task does not assess a diagram.", provenance: "aptly_authored" },
    };
    mocks.latest.mockResolvedValue({ question, targetSkills: written.targetSkills, levelRelevance: written.levelRelevance,
      bankQuestionId: written.id, gradingBlueprintVersion: written.gradingBlueprintVersion });
    const response = await POST(request({ topicCode: "1.2" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ practiceQuestion: question, reused: true });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("honors pilot rollback and SL exclusion before saving a new question", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "false");
    expect((await POST(request())).status).toBe(503); expect(mocks.save).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
    expect((await POST(request({ topicCode: "2.11" }))).status).toBe(403);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
