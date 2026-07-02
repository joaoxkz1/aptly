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
      return {
        select: () => ({
          gte: async () => ({ count: state.count, error: state.countError }),
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
