import { describe, expect, it, vi } from "vitest";
import { createPracticeGenerationClient } from "./practice-request";

/**
 * Client-side duplicate-call safety: within one tab, every concurrent caller
 * (double-click, strict-mode double mount, rerender race) adopts ONE shared
 * in-flight request — never a second paid generation. Sequential intentional
 * calls (e.g. "Generate another question") issue fresh requests.
 */

const QUESTION = {
  id: "pq-1",
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createPracticeGenerationClient — one in-flight request per tab", () => {
  it("concurrent duplicate calls share ONE fetch and resolve identically", async () => {
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(() => gate);
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);

    // Double-click / double mount: both calls start before the first settles.
    const first = client.request();
    const second = client.request();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    release(jsonResponse({ practiceQuestion: QUESTION, reused: true }));
    const [a, b] = await Promise.all([first, second]);
    expect(a.practiceQuestion?.id).toBe("pq-1");
    expect(b.practiceQuestion?.id).toBe("pq-1");
    expect(a.reused).toBe(true);
  });

  it("a settled request clears the slot so the NEXT intentional call fetches again", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ practiceQuestion: QUESTION, reused: false }));
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);
    await client.request();
    await client.request({ regenerate: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends regenerate:false by default and regenerate:true only when explicit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ practiceQuestion: QUESTION, reused: true }));
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);

    await client.request();
    await client.request({ regenerate: true });

    const bodies = (fetchImpl.mock.calls as unknown as [string, RequestInit][]).map((call) =>
      JSON.parse(call[1].body as string)
    );
    expect(bodies[0]).toEqual({ regenerate: false });
    expect(bodies[1]).toEqual({ regenerate: true });
  });

  it("a failed request clears the slot so a retry is possible", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({ practiceQuestion: QUESTION, reused: true }));
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);

    await expect(client.request()).rejects.toBeTruthy();
    const retry = await client.request();
    expect(retry.practiceQuestion?.id).toBe("pq-1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps failure payloads to a safe outcome (no throw on HTTP errors)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "daily_practice_limit_reached" }, 429)
    );
    const client = createPracticeGenerationClient(fetchImpl as unknown as typeof fetch);
    const outcome = await client.request({ regenerate: true });
    expect(outcome.status).toBe(429);
    expect(outcome.code).toBe("daily_practice_limit_reached");
    expect(outcome.practiceQuestion).toBeNull();
    expect(outcome.reused).toBe(false);
  });
});
