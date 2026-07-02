import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_GRADE_LIMIT } from "@/lib/ai/config";

/**
 * Grade-route safety gates: auth before quota, the daily pilot limit before
 * the paid model call, and production-safe failure payloads/logs that never
 * contain student text.
 */

const STUDENT_QUESTION = "Evaluate the use of tariffs to protect infant industries. [15 marks]";
const STUDENT_ANSWER =
  "Tariffs raise import prices, shifting demand to domestic infant industries so they can scale.";

// Mutable per-test state read by the mocks.
const state = {
  claims: null as Record<string, unknown> | null,
  count: 0,
  countError: null as unknown,
  practiceRow: null as Record<string, unknown> | null,
  practiceError: null as unknown,
  // The parent attempt row a revision's source-retention lookup resolves to.
  parentRow: null as Record<string, unknown> | null,
  parentError: null as unknown,
};

const fromSpy = vi.fn();
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
            eq: () => ({
              maybeSingle: async () => ({ data: state.practiceRow, error: state.practiceError }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          // Daily-cap count path.
          gte: async () => ({ count: state.count, error: state.countError }),
          // Revision source-retention lookup (parent attempt by id).
          eq: () => ({
            maybeSingle: async () => ({ data: state.parentRow, error: state.parentError }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/ai/openai", () => ({
  getOpenAI: () => ({ responses: { create: openaiCreate } }),
}));

import { POST } from "./route";

function gradeRequest(body: unknown): Request {
  return new Request("http://localhost/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  subject: "Economics",
  topic: "Economics",
  question: STUDENT_QUESTION,
  answer: STUDENT_ANSWER,
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.claims = { sub: "user-1" };
  state.count = 0;
  state.countError = null;
  state.practiceRow = null;
  state.practiceError = null;
  state.parentRow = null;
  state.parentError = null;
  fromSpy.mockClear();
  openaiCreate.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/grade — auth precedes quota", () => {
  it("blocks unauthenticated requests before any quota logic or model call", async () => {
    state.claims = null;
    const res = await POST(gradeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/grade — daily pilot limit", () => {
  it("proceeds to the model when under the limit", async () => {
    state.count = DAILY_GRADE_LIMIT - 1;
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(gradeRequest(VALID_BODY));
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 429 with the dedicated code exactly at the limit — no model call", async () => {
    state.count = DAILY_GRADE_LIMIT;
    const res = await POST(gradeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_grade_limit_reached" });
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("fails closed (no model call) when the capacity check itself errors", async () => {
    state.countError = new Error("db unavailable");
    const res = await POST(gradeRequest(VALID_BODY));
    expect(res.status).toBe(502);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/grade — Aptly-generated practice grades against the STORED record", () => {
  const STORED_QUESTION =
    "Using information from the text and your knowledge of economics, discuss whether the excise tax benefits Norvia. [15 marks]";
  const STORED_SOURCE =
    "In 2024 Norvia introduced a 25% excise tax on high-sugar drinks; purchases fell 9% and revenue reached $85 million while producers cut sugar content 12%.";
  const CLIENT_QUESTION = "Totally different doctored question claiming Paper 1. [40 marks]";
  const CLIENT_SOURCE = "FAKE client-substituted source pretending to be the generated one.";

  it("uses the stored question, source, and framework — never client text", async () => {
    state.practiceRow = {
      id: "pq-1",
      question: STORED_QUESTION,
      source_material: STORED_SOURCE,
      framework: "paper2g_15_mark",
      mark_total: 15,
    };
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        question: CLIENT_QUESTION,
        sourceMaterial: CLIENT_SOURCE,
        practiceQuestionId: "pq-1",
        // Client attempts to force a different frame — all ignored.
        requestedSource: "user_confirmed",
        requestedTotal: 40,
        requestedFramework: "paper1b_15_mark",
      })
    );

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    const userContent = request.input[1].content;
    expect(userContent).toContain(STORED_QUESTION);
    expect(userContent).toContain(STORED_SOURCE);
    expect(userContent).toContain("paper2g_15_mark");
    expect(userContent).toContain("total 15 marks");
    expect(userContent).not.toContain(CLIENT_QUESTION);
    expect(userContent).not.toContain(CLIENT_SOURCE);
  });

  it("rejects an unknown / not-owned practice question id without detail", async () => {
    state.practiceRow = null; // RLS: another user's id resolves to no row
    const res = await POST(gradeRequest({ ...VALID_BODY, practiceQuestionId: "someone-elses" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("fails closed if the stored row carries an unsupported framework", async () => {
    state.practiceRow = {
      id: "pq-1",
      question: STORED_QUESTION,
      source_material: null,
      framework: "paper2_four_mark_diagram_explain",
      mark_total: 4,
    };
    const res = await POST(gradeRequest({ ...VALID_BODY, practiceQuestionId: "pq-1" }));
    expect(res.status).toBe(502);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("still enforces the daily grade limit for practice attempts", async () => {
    state.practiceRow = {
      id: "pq-1",
      question: STORED_QUESTION,
      source_material: STORED_SOURCE,
      framework: "paper2g_15_mark",
      mark_total: 15,
    };
    state.count = DAILY_GRADE_LIMIT;
    const res = await POST(gradeRequest({ ...VALID_BODY, practiceQuestionId: "pq-1" }));
    expect(res.status).toBe(429);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/grade — revision source retention (manual Paper 2(g)/3(b))", () => {
  const REVISION_QUESTION =
    "Paper 3(b): Using information from the text, recommend a policy the government of Norvia could introduce to reduce fuel poverty. [10]";
  const RETAINED_SOURCE =
    "In 2024 Norvia raised fuel taxes by 12%; consumption fell 5% while 300,000 low-income households reported energy arrears, and revenue reached $2.1bn.";
  const CLIENT_SOURCE = "FAKE client-substituted source trying to replace the original context.";

  it("uses the parent's RETAINED source server-side — client source is ignored", async () => {
    state.parentRow = { id: "parent-uuid", source_material: RETAINED_SOURCE };
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        question: REVISION_QUESTION,
        parentAttemptId: "parent-uuid",
        // A hostile/buggy client tries to swap the source for the comparison.
        sourceMaterial: CLIENT_SOURCE,
      })
    );

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    const userContent = request.input[1].content;
    // Source-based estimate against the ORIGINAL stored source.
    expect(userContent).toContain(RETAINED_SOURCE);
    expect(userContent).toContain("paper3b_10_mark");
    expect(userContent).not.toContain(CLIENT_SOURCE);
  });

  it("without a retained source (pre-patch parent), the one-time pasted source applies", async () => {
    state.parentRow = { id: "parent-uuid", source_material: null };
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        question: REVISION_QUESTION,
        parentAttemptId: "parent-uuid",
        sourceMaterial: RETAINED_SOURCE, // the student's re-paste
      })
    );
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    expect(request.input[1].content).toContain(RETAINED_SOURCE);
  });

  it("a deleted/foreign parent id resolves to no row and falls back safely", async () => {
    state.parentRow = null; // RLS: not this user's row (or already deleted)
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        question: REVISION_QUESTION,
        parentAttemptId: "someone-elses",
        sourceMaterial: RETAINED_SOURCE,
      })
    );
    // No leak, no crash — the client-pasted source flow applies as before.
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    expect(request.input[1].content).toContain(RETAINED_SOURCE);
  });

  it("a source-less revision of a Paper 3(b) attempt can NEVER become a marked frame (server gate)", async () => {
    // The old-source revision bug: a user-confirmed total resolves to a marked
    // GENERIC frame with no source gate, asking the model to mark a
    // data-response answer without its text — an impossible frame it fails.
    // With the parent's stored framework as ground truth, the server now
    // downgrades to an honest feedback-only frame instead.
    state.parentRow = {
      id: "parent-uuid",
      source_material: null, // pre-retention attempt
      assessment: { framework: "paper3b_10_mark" },
    };
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        question: "Using information from the text, recommend a policy to reduce fuel poverty.",
        parentAttemptId: "parent-uuid",
        requestedSource: "user_confirmed",
        requestedTotal: 10,
        sourceMaterial: null,
      })
    );
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    const userContent = request.input[1].content;
    expect(userContent).toContain("FEEDBACK ONLY");
    expect(userContent).not.toContain("ASSESSABLE 10");
  });

  it("the gate passes a source-backed revision through unchanged (marked estimate)", async () => {
    state.parentRow = {
      id: "parent-uuid",
      source_material: null, // pre-retention: the student re-pastes once
      assessment: { framework: "paper3b_10_mark" },
    };
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        question: REVISION_QUESTION,
        parentAttemptId: "parent-uuid",
        sourceMaterial: RETAINED_SOURCE, // the one-time re-paste
      })
    );
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    const userContent = request.input[1].content;
    expect(userContent).toContain("paper3b_10_mark");
    expect(userContent).toContain("total 10 marks");
    expect(userContent).toContain(RETAINED_SOURCE);
  });

  it("fails closed when the parent lookup errors — no model call", async () => {
    state.parentError = new Error("db unavailable");
    const res = await POST(
      gradeRequest({ ...VALID_BODY, question: REVISION_QUESTION, parentAttemptId: "parent-uuid" })
    );
    expect(res.status).toBe(502);
    expect(openaiCreate).not.toHaveBeenCalled();
    const event = JSON.parse(errorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(event.stage).toBe("revision_context");
  });

  it("failure payloads and logs never contain the retained source text", async () => {
    state.parentRow = { id: "parent-uuid", source_material: RETAINED_SOURCE };
    openaiCreate.mockRejectedValue(new Error(`model refused: ${RETAINED_SOURCE}`));
    const res = await POST(
      gradeRequest({ ...VALID_BODY, question: REVISION_QUESTION, parentAttemptId: "parent-uuid" })
    );
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain(RETAINED_SOURCE);
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).not.toContain(RETAINED_SOURCE);
    expect(line).not.toContain("parent-uuid");
  });

  it("generated practice is untouched: the practice branch wins over parentAttemptId", async () => {
    state.practiceRow = {
      id: "pq-1",
      question: "Using information from the text, discuss the tax. [15 marks]",
      source_material: "Generated stimulus: output rose 4% in 2025 while emissions fell 2%.",
      framework: "paper2g_15_mark",
      mark_total: 15,
    };
    state.parentRow = { id: "parent-uuid", source_material: RETAINED_SOURCE };
    openaiCreate.mockRejectedValue(new Error("sentinel"));
    await POST(
      gradeRequest({
        ...VALID_BODY,
        practiceQuestionId: "pq-1",
        parentAttemptId: "parent-uuid", // a revision of a generated attempt
      })
    );
    const request = openaiCreate.mock.calls[0][0] as {
      input: { role: string; content: string }[];
    };
    // The Aptly-generated source (practice_questions) is used — never the
    // attempts-row copy, so the generated privacy model is not duplicated.
    expect(request.input[1].content).toContain("Generated stimulus");
    expect(request.input[1].content).not.toContain(RETAINED_SOURCE);
  });
});

describe("POST /api/grade — failure payloads and logs never expose student text", () => {
  it("returns a generic code + short safe reference, and logs one structured event", async () => {
    openaiCreate.mockRejectedValue(new Error(`model refused: ${STUDENT_ANSWER}`));
    const res = await POST(gradeRequest(VALID_BODY));
    expect(res.status).toBe(502);

    const body = (await res.json()) as { error: string; reference: string };
    expect(body.error).toBe("grading_failed");
    expect(body.reference).toMatch(/^[0-9A-F]{8}$/);

    // Nothing student-derived in the client payload.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(STUDENT_QUESTION);
    expect(raw).not.toContain(STUDENT_ANSWER);

    // Exactly one structured, production-safe log event.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(event.event).toBe("grade_request_failed");
    expect(event.stage).toBe("openai");
    expect(event.status).toBe(502);
    expect(typeof event.requestId).toBe("string");
    expect(line).not.toContain(STUDENT_QUESTION);
    expect(line).not.toContain(STUDENT_ANSWER);
    expect(line).not.toContain("user-1");
  });
});
