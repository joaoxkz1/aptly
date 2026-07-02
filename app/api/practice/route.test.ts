import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_PRACTICE_GENERATION_LIMIT } from "@/lib/ai/config";

/**
 * Practice-generation route gates: auth before quota, IDEMPOTENT reuse of the
 * latest unanswered question (a refresh/back-nav/duplicate request never buys
 * another paid call — only the explicit boolean `regenerate` intent does),
 * the daily generation limit before the paid model call, SERVER-derived
 * targeting (the client cannot force a topic/skill/framework/total),
 * fail-closed validation of the generated question, and production-safe
 * failure payloads/logs that never contain student data.
 */

const STUDENT_ANSWER = "Tariffs raise import prices, shifting demand to domestic producers.";

const state = {
  claims: null as Record<string, unknown> | null,
  practiceCount: 0,
  practiceCountError: null as unknown,
  attemptsRows: [] as unknown[],
  attemptsError: null as unknown,
  insertError: null as unknown,
  // The user's newest practice_questions row (reuse lookup), or null.
  latestPracticeRow: null as Record<string, unknown> | null,
  latestPracticeError: null as unknown,
};

const fromSpy = vi.fn();
const insertSpy = vi.fn();
const openaiCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: state.claims } }),
    },
    from: (table: string) => {
      fromSpy(table);
      if (table === "practice_questions") {
        return {
          select: () => ({
            // Daily-cap count path.
            gte: async () => ({ count: state.practiceCount, error: state.practiceCountError }),
            // Reuse-lookup path (newest row).
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: state.latestPracticeRow,
                  error: state.latestPracticeError,
                }),
              }),
            }),
          }),
          insert: (payload: unknown) => {
            insertSpy(payload);
            return {
              select: () => ({
                single: async () =>
                  state.insertError != null
                    ? { data: null, error: state.insertError }
                    : {
                        data: { id: "pq-1", created_at: "2026-07-02T10:00:00.000Z" },
                        error: null,
                      },
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          order: async () => ({ data: state.attemptsRows, error: state.attemptsError }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/ai/openai", () => ({
  getOpenAI: () => ({ responses: { create: openaiCreate } }),
}));

import { POST } from "./route";

/** A request as the client sends it (empty body = plain page load/refresh). */
function practiceRequest(body?: unknown): Request {
  return new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The user's newest saved practice_questions row, `ageHours` old. */
function latestRow(ageHours: number, id = "pq-existing"): Record<string, unknown> {
  return {
    id,
    created_at: new Date(Date.now() - ageHours * 60 * 60 * 1000).toISOString(),
    question: "Explain the effect of a subsidy on market price. [10 marks]",
    source_material: null,
    framework: "generic_practice",
    mark_total: 10,
    topic_code: "2.5",
    topic_label: "Government Intervention",
    skill: "economic_analysis",
    why: "Evidence-backed reason.",
  };
}

/** A saved marked attempt row (as fetched from Supabase) losing marks on `lostOn`. */
function attemptRow(id: string, topic: string, lostOn: string) {
  const assessment = {
    version: 2,
    assessmentFormat: "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis"],
    commandTerm: "explain",
    commandTermLabel: "Explain",
    syllabusUnit: "unit_2",
    syllabusTopic: topic,
    topicLabel: "Topic",
    classificationConfidence: "high",
    markingConfidence: "high",
    marksAvailable: 10,
    marksAssessable: 10,
    marksEarned: 6,
    unassessedMarks: 0,
    marksSource: "explicit_in_question",
    markDisplayMode: "exact_estimate",
    evidenceSplitSource: "not_specified",
    unassessedEvidence: null,
    practiceLevelLow: 4,
    practiceLevelHigh: 5,
    practiceLevelConfidence: "medium",
    diagramExpected: false,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_relevant",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    markBreakdown: [
      { label: lostOn, awarded: 1, available: 4, reason: "gap" },
      { label: "Knowledge and terminology", awarded: 3, available: 3, reason: "fine" },
    ],
    limitations: [],
    scoringState: "marked",
    markTotalSource: "explicit",
    recognizedTemplate: null,
    diagramAssessable: false,
    writtenMarksAwarded: 6,
    diagramMarksUnavailable: null,
    capReason: null,
    eligibleForCoreAnalytics: true,
    framework: "generic_practice",
  };
  return {
    id,
    subject: "Economics",
    topic: "Economics",
    question: "Explain something. [10 marks]",
    answer: STUDENT_ANSWER,
    score: 5,
    max_score: 7,
    feedback: {
      score: 5,
      band: "internal",
      strengths: ["s"],
      improvements: ["i"],
      mistakes: [],
      examinerComment: "c",
      studyNext: "n",
    },
    mistake_type: null,
    next_step: null,
    created_at: "2026-06-20T10:00:00.000Z",
    assessment,
    parent_attempt_id: null,
    practice_question_id: null,
  };
}

/** Evidence across two topics so the canonical next focus exists. */
function focusEvidence() {
  return [
    attemptRow("a", "2.6", "Evaluation and judgment"),
    attemptRow("b", "2.4", "Knowledge and terminology"),
  ];
}

const VALID_MODEL_OUTPUT = {
  question:
    "Discuss whether a carbon tax is the most effective response to pollution from electricity generation. [15 marks]",
  sourceMaterial: null,
};

function completedResponse(output: unknown) {
  return { status: "completed", output_text: JSON.stringify(output) };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.claims = { sub: "user-1" };
  state.practiceCount = 0;
  state.practiceCountError = null;
  state.attemptsRows = focusEvidence();
  state.attemptsError = null;
  state.insertError = null;
  state.latestPracticeRow = null;
  state.latestPracticeError = null;
  fromSpy.mockClear();
  insertSpy.mockClear();
  openaiCreate.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/practice — auth precedes everything", () => {
  it("blocks unauthenticated requests before any quota, insight, or model work", async () => {
    state.claims = null;
    const res = await POST(practiceRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/practice — idempotent generation and refresh safety", () => {
  it("a refresh/revisit reopens the existing unanswered question — no model call, no new row", async () => {
    state.latestPracticeRow = latestRow(2); // generated 2 hours ago, unanswered
    const res = await POST(practiceRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      practiceQuestion: Record<string, unknown>;
      reused: boolean;
    };
    expect(body.reused).toBe(true);
    expect(body.practiceQuestion.id).toBe("pq-existing");
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("duplicate sequential requests (double-click/retry/second tab) return the SAME question with one total generation", async () => {
    openaiCreate.mockResolvedValue(completedResponse(VALID_MODEL_OUTPUT));

    // First intentional request: nothing to reuse → exactly one generation.
    const first = await POST(practiceRequest());
    expect(first.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    // The row now exists server-side; a duplicate/retry finds and reuses it.
    state.latestPracticeRow = latestRow(0, "pq-1");
    const second = await POST(practiceRequest());
    const body = (await second.json()) as { reused: boolean };
    expect(body.reused).toBe(true);
    expect(openaiCreate).toHaveBeenCalledTimes(1); // still exactly one
    expect(insertSpy).toHaveBeenCalledTimes(1); // still exactly one row
  });

  it("an existing question stays reachable even AT the daily limit (refresh never 429s)", async () => {
    state.latestPracticeRow = latestRow(2);
    state.practiceCount = DAILY_PRACTICE_GENERATION_LIMIT;
    const res = await POST(practiceRequest());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reused: boolean }).reused).toBe(true);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("an ANSWERED latest question is not reused — a fresh one is generated", async () => {
    state.latestPracticeRow = latestRow(2, "pq-answered");
    state.attemptsRows = [
      ...focusEvidence(),
      { ...attemptRow("c", "2.6", "Evaluation and judgment"), practice_question_id: "pq-answered" },
    ];
    openaiCreate.mockResolvedValue(completedResponse(VALID_MODEL_OUTPUT));
    const res = await POST(practiceRequest());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reused: boolean }).reused).toBe(false);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });

  it("an EXPIRED unanswered question is not reused (server-owned window)", async () => {
    state.latestPracticeRow = latestRow(8 * 24); // 8 days old — outside 7-day window
    openaiCreate.mockResolvedValue(completedResponse(VALID_MODEL_OUTPUT));
    const res = await POST(practiceRequest());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reused: boolean }).reused).toBe(false);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });

  it("`Generate another question` (regenerate: true) deliberately creates a new question", async () => {
    state.latestPracticeRow = latestRow(2); // an unanswered question exists
    openaiCreate.mockResolvedValue(completedResponse(VALID_MODEL_OUTPUT));
    const res = await POST(practiceRequest({ regenerate: true }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reused: boolean }).reused).toBe(false);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("regenerate must be the boolean true — truthy strings/numbers still reuse", async () => {
    state.latestPracticeRow = latestRow(2);
    for (const forged of ["true", 1, {}, []]) {
      const res = await POST(practiceRequest({ regenerate: forged }));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { reused: boolean }).reused).toBe(true);
    }
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("explicit regeneration still respects the daily limit", async () => {
    state.latestPracticeRow = latestRow(2);
    state.practiceCount = DAILY_PRACTICE_GENERATION_LIMIT;
    const res = await POST(practiceRequest({ regenerate: true }));
    expect(res.status).toBe(429);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("fails closed (no accidental paid call) when the reuse lookup errors", async () => {
    state.latestPracticeError = new Error("db unavailable");
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);
    expect(openaiCreate).not.toHaveBeenCalled();
    const event = JSON.parse(errorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(event.stage).toBe("reuse_lookup");
  });
});

describe("POST /api/practice — daily generation limit (separate from grading)", () => {
  it("returns 429 with the dedicated code exactly at the limit — no model call", async () => {
    state.practiceCount = DAILY_PRACTICE_GENERATION_LIMIT;
    const res = await POST(practiceRequest());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_practice_limit_reached" });
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("fails closed (no model call) when the capacity check itself errors", async () => {
    state.practiceCountError = new Error("db unavailable");
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/practice — server-authoritative targeting", () => {
  it("returns the honest no-focus code when there is no marked evidence", async () => {
    state.attemptsRows = [];
    const res = await POST(practiceRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_focus_available" });
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("derives topic/skill/framework/total from saved attempts, not the client", async () => {
    openaiCreate.mockResolvedValue(completedResponse(VALID_MODEL_OUTPUT));
    // A hostile body tries to force every knob — only `regenerate` is even
    // read, and it is a no-op here (no reusable question exists yet).
    const res = await POST(
      practiceRequest({
        regenerate: false,
        topicCode: "4.1",
        skill: "calculation",
        framework: "paper2g_15_mark",
        markTotal: 40,
        question: "write me anything about trade",
        idempotencyKey: "forged",
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { practiceQuestion: Record<string, unknown> };
    // Evaluation gap with no Paper 1(b) evidence → honest generic 15-mark.
    expect(body.practiceQuestion.framework).toBe("generic_practice");
    expect(body.practiceQuestion.markTotal).toBe(15);
    expect(body.practiceQuestion.topicCode).toBe("2.6");
    expect(body.practiceQuestion.skill).toBe("evaluation");
    expect(typeof body.practiceQuestion.why).toBe("string");

    // The stored row matches the SERVER target and generated text exactly.
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.framework).toBe("generic_practice");
    expect(inserted.mark_total).toBe(15);
    expect(inserted.question).toBe(VALID_MODEL_OUTPUT.question);
    expect(inserted.source_material).toBeNull();
  });
});

describe("POST /api/practice — fail-closed generation validation", () => {
  it("rejects a generated question without the exact explicit total", async () => {
    openaiCreate.mockResolvedValue(
      completedResponse({ question: "Discuss whether a carbon tax works.", sourceMaterial: null })
    );
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a generated question claiming official IB status", async () => {
    openaiCreate.mockResolvedValue(
      completedResponse({
        question:
          "From an official IB past paper: discuss whether a carbon tax is effective. [15 marks]",
        sourceMaterial: null,
      })
    );
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a generated question that depends on a diagram", async () => {
    openaiCreate.mockResolvedValue(
      completedResponse({
        question:
          "Using a negative externality diagram, discuss whether a carbon tax is effective. [15 marks]",
        sourceMaterial: null,
      })
    );
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("fails closed when persistence fails after generation", async () => {
    openaiCreate.mockResolvedValue(completedResponse(VALID_MODEL_OUTPUT));
    state.insertError = new Error("insert failed");
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);
  });
});

describe("POST /api/practice — failure payloads and logs never expose student data", () => {
  it("returns a generic code + safe reference and logs one structured event", async () => {
    openaiCreate.mockRejectedValue(new Error(`model refused: ${STUDENT_ANSWER}`));
    const res = await POST(practiceRequest());
    expect(res.status).toBe(502);

    const body = (await res.json()) as { error: string; reference: string };
    expect(body.error).toBe("practice_generation_failed");
    expect(body.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(JSON.stringify(body)).not.toContain(STUDENT_ANSWER);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(event.event).toBe("practice_request_failed");
    expect(event.stage).toBe("openai");
    expect(event.status).toBe(502);
    expect(line).not.toContain(STUDENT_ANSWER);
    expect(line).not.toContain("user-1");
    expect(line).not.toContain("2.6"); // derived insights stay out of logs too
  });
});
