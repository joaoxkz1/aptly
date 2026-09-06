import { describe, expect, it, vi } from "vitest";
import { createPracticeGenerationClient } from "./practice-request";

/**
 * Client-side duplicate-call safety: within one tab, every concurrent caller
 * (double-click, strict-mode double mount, rerender race) adopts ONE shared
 * in-flight request — never a second paid generation. Sequential intentional
 * calls (e.g. "Generate another question") issue fresh requests.
 */

const QUESTION = {
  id: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-07-02T10:00:00.000Z",
  question: "Explain the effect of a subsidy on market price. [10 marks]",
  sourceMaterial: null,
  framework: "generic_practice",
  markTotal: 10,
  topicCode: "2.5",
  topicLabel: "Government Intervention",
  skill: "economic_analysis",
  why: "Evidence-backed reason.",
};

const REQUEST = {
  marks: 10 as const,
  topicCode: "2.7",
  context: "general" as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createPracticeGenerationClient — one in-flight request per tab", () => {
  function requestKeys(fetchImpl: ReturnType<typeof vi.fn>): string[] {
    return fetchImpl.mock.calls.map((call) =>
      (JSON.parse((call[1] as RequestInit).body as string) as { idempotencyKey: string }).idempotencyKey
    );
  }

  it.each([
    [502, { error: "practice_generation_failed" }],
    [503, { error: "request_failed" }],
    [409, { error: "request_in_progress" }],
    [200, {}],
    [200, { practiceQuestion: { id: "" } }],
  ])("keeps the operation identity after an uncertain or processing response (%i)", async (status, body) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(body, status))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: QUESTION }));
    const client = createPracticeGenerationClient(fetchImpl);
    await client.request({ ...REQUEST, regenerate: true });
    await client.request({ ...REQUEST, regenerate: true });
    expect(requestKeys(fetchImpl)[1]).toBe(requestKeys(fetchImpl)[0]);
  });

  it("preserves identity through malformed HTTP responses and repeated reconciliation", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("gateway failure", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ error: "request_in_progress" }, 409))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: QUESTION }));
    const client = createPracticeGenerationClient(fetchImpl);
    await client.request(REQUEST);
    await client.request(REQUEST);
    await client.request(REQUEST);
    expect(new Set(requestKeys(fetchImpl)).size).toBe(1);
  });

  it("waits for an explicit action after terminal reconciliation, then uses one fresh key for double clicks", async () => {
    let finish!: (response: Response) => void;
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "request_failed" }, 409))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const client = createPracticeGenerationClient(fetchImpl);
    await client.request(REQUEST);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const retry = client.request(REQUEST);
    const duplicate = client.request(REQUEST);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestKeys(fetchImpl)[1]).not.toBe(requestKeys(fetchImpl)[0]);
    finish(jsonResponse({ practiceQuestion: QUESTION }));
    expect(await retry).toEqual(await duplicate);
  });

  it("allows an explicitly changed intent to receive a fresh identity after uncertainty", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "practice_generation_failed" }, 502))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: QUESTION }));
    const client = createPracticeGenerationClient(fetchImpl);
    await client.request(REQUEST);
    await client.request({ ...REQUEST, topicCode: "3.5" });
    expect(requestKeys(fetchImpl)[1]).not.toBe(requestKeys(fetchImpl)[0]);
  });

  it("treats an explicit course change as new intent without sending trusted course metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "practice_generation_failed" }, 502))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: QUESTION }));
    const client = createPracticeGenerationClient(fetchImpl);
    await client.request({ ...REQUEST, courseLevel: "sl" });
    await client.request({ ...REQUEST, courseLevel: "hl" });
    expect(requestKeys(fetchImpl)[1]).not.toBe(requestKeys(fetchImpl)[0]);
    for (const call of fetchImpl.mock.calls) {
      expect(JSON.parse((call[1] as RequestInit).body as string)).not.toHaveProperty("courseLevel");
    }
  });

  it("completes a confirmed result so the next explicit request for another question uses a fresh key", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ practiceQuestion: QUESTION }));
    const client = createPracticeGenerationClient(fetchImpl);
    await client.request({ ...REQUEST, regenerate: true });
    await client.request({ ...REQUEST, regenerate: true });
    expect(requestKeys(fetchImpl)[1]).not.toBe(requestKeys(fetchImpl)[0]);
  });

  it("a different focus waits for its own response instead of adopting stale context", async () => {
    let finish!: (response: Response) => void;
    const fetchImpl = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: { ...QUESTION, id: "55555555-5555-4555-8555-555555555555", skill: "application", markTotal: 15 } }));
    const client = createPracticeGenerationClient(fetchImpl);
    const first = client.request(REQUEST);
    const second = client.request({ marks: 15, topicCode: "2.8", context: "current_focus" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    finish(jsonResponse({ practiceQuestion: QUESTION }));
    expect((await first).practiceQuestion?.id).toBe(QUESTION.id);
    expect((await second).practiceQuestion?.id).toBe("55555555-5555-4555-8555-555555555555");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("concurrent duplicate calls share ONE fetch and resolve identically", async () => {
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(() => gate);
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);

    // Double-click / double mount: both calls start before the first settles.
    const first = client.request(REQUEST);
    const second = client.request(REQUEST);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    release(jsonResponse({ practiceQuestion: QUESTION, reused: true }));
    const [a, b] = await Promise.all([first, second]);
    expect(a.practiceQuestion?.id).toBe(QUESTION.id);
    expect(b.practiceQuestion?.id).toBe(QUESTION.id);
    expect(a.reused).toBe(true);
  });

  it("a settled request clears the slot so the NEXT intentional call fetches again", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ practiceQuestion: QUESTION, reused: false }));
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);
    await client.request(REQUEST);
    await client.request({ ...REQUEST, regenerate: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends regenerate:false by default and regenerate:true only when explicit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ practiceQuestion: QUESTION, reused: true }));
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);

    await client.request(REQUEST);
    await client.request({ ...REQUEST, regenerate: true });

    const bodies = (fetchImpl.mock.calls as unknown as [string, RequestInit][]).map((call) =>
      JSON.parse(call[1].body as string)
    );
    expect(bodies[0]).toMatchObject({
      marks: 10,
      topicCode: "2.7",
      context: "general",
      regenerate: false,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(bodies[1]).toMatchObject({
      regenerate: true,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("a failed request clears the slot so a retry is possible", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: QUESTION, reused: true }));
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);

    await expect(client.request(REQUEST)).rejects.toBeTruthy();
    const retry = await client.request(REQUEST);
    expect(retry.practiceQuestion?.id).toBe(QUESTION.id);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestKeys(fetchImpl)[1]).toBe(requestKeys(fetchImpl)[0]);
  });

  it("maps failure payloads to a safe outcome (no throw on HTTP errors)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "daily_practice_limit_reached" }, 429)
    );
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);
    const outcome = await client.request({ ...REQUEST, regenerate: true });
    expect(outcome.status).toBe(429);
    expect(outcome.code).toBe("daily_practice_limit_reached");
    expect(outcome.practiceQuestion).toBeNull();
    expect(outcome.reused).toBe(false);
  });
});
