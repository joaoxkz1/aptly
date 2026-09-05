import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "@/lib/types";
import { focusHistory, focusAttempt } from "@/lib/testing/focused-practice-fixtures";
const state = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null, attempts: [] as Attempt[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: state.claims } }) } }) }));
vi.mock("@/lib/supabase/attempts", () => ({ fetchAttempts: async () => state.attempts }));
import { GET } from "./route";
const request = (params: string) => new Request(`http://local/api/practice/focus?${params}`);
beforeEach(() => { state.claims = { sub: "11111111-1111-4111-8111-111111111111", user_metadata: { economics_level: "sl" } }; state.attempts = focusHistory(); });
describe("read-only verified focus preview", () => {
  it("requires authenticated, owned evidence", async () => {
    state.claims = null; expect((await GET(request("source=current_focus"))).status).toBe(401);
    state.claims = { sub: "11111111-1111-4111-8111-111111111111", user_metadata: { economics_level: "sl" } };
    expect((await GET(request("source=answer_feedback&attempt=11111111-1111-4111-8111-111111111111"))).status).toBe(409);
  });
  it("ignores forged display hints and returns the saved canonical focus", async () => {
    const response = await GET(request("source=current_focus&skill=calculation&topic=3.5&marks=2"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).focus).toMatchObject({ targetSkill: "application", topicCode: "2.8", recommendedMarks: 15, serverVerified: true });
  });
  it("uses the specified answer rather than global history", async () => {
    const answer = focusAttempt("Economic analysis", "3.5"); state.attempts = [answer];
    const response = await GET(request(`source=answer_feedback&attempt=${answer.id}`));
    expect((await response.json()).focus).toMatchObject({ source: "answer_feedback", targetSkill: "economic_analysis", topicCode: "3.5" });
  });
  it("returns an honest unsupported focus for the UI without generating", async () => {
    state.attempts = focusHistory("Data use");
    expect((await (await GET(request("source=current_focus"))).json()).focus).toMatchObject({ targetSkill: "data_interpretation", recommendedMarks: null });
  });
});
