import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  deleteUser: vi.fn(async () => ({ error: null as unknown })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.claims } }) },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));

import { POST } from "./route";

beforeEach(() => {
  mocks.claims = { sub: USER_ID };
  mocks.deleteUser.mockReset();
  mocks.deleteUser.mockResolvedValue({ error: null });
});

describe("POST /api/account/delete", () => {
  it("refuses an unauthenticated caller and never touches the admin client", async () => {
    mocks.claims = null;
    const response = await POST();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a session whose subject is not a valid user id", async () => {
    for (const claims of [{}, { sub: "not-a-uuid" }, { sub: 42 }]) {
      mocks.claims = claims as Record<string, unknown>;
      expect((await POST()).status).toBe(401);
    }
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the session's own user via the service-role admin client", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  /**
   * The strongest guarantee here is structural: the handler takes no
   * parameters, so there is no request object to read a body from. A caller
   * cannot name a victim because the handler has no channel to receive one.
   */
  it("cannot be pointed at another user — the handler accepts no input at all", async () => {
    expect(POST.length).toBe(0);
    mocks.claims = { sub: OTHER_USER_ID };
    await POST();
    expect(mocks.deleteUser).toHaveBeenCalledWith(OTHER_USER_ID);
    expect(mocks.deleteUser).not.toHaveBeenCalledWith(USER_ID);
  });

  it("fails closed with a generic code when provider deletion errors", async () => {
    mocks.deleteUser.mockResolvedValue({ error: new Error("boom") });
    const response = await POST();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "delete_failed" });
  });

  it("fails closed when the admin client throws", async () => {
    mocks.deleteUser.mockRejectedValue(new Error("network"));
    expect((await POST()).status).toBe(502);
  });

  it("never puts the user id, email, or error message in the failure log", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
    mocks.deleteUser.mockRejectedValue(new Error(`secret for ${USER_ID}`));
    await POST();
    spy.mockRestore();

    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain(USER_ID);
    expect(logged[0]).not.toContain("secret for");
    const event = JSON.parse(logged[0]) as Record<string, unknown>;
    expect(event.event).toBe("account_delete_failed");
    expect(event.errorClass).toBe("Error");
    expect(Object.keys(event).sort()).toEqual([
      "errorClass",
      "event",
      "requestId",
      "timestamp",
    ]);
  });
});
