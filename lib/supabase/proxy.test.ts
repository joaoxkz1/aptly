import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-guard behavior of the auth proxy. The critical rule under test: API
 * calls are NEVER redirected to the login HTML page. A redirect would hand
 * fetch() a 200 HTML "success", so the client's dedicated 401 handling
 * ("Your session expired. Please sign in again.") could never fire and an
 * expired session would surface as a misleading generic failure.
 */

// Mutable per-test auth state read by the mock.
const state = {
  claims: null as Record<string, unknown> | null,
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: { claims: state.claims } }),
    },
  }),
}));

import { updateSession } from "./proxy";

const NAMED_USER = { sub: "user-1", user_metadata: { display_name: "Maya" } };

function req(path: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method });
}

beforeEach(() => {
  state.claims = null;
});

describe("updateSession — API routes", () => {
  it("returns 401 JSON (not a login redirect) for an unauthenticated API call", async () => {
    const res = await updateSession(req("/api/grade", "POST"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("passes an authenticated API call through to the route handler", async () => {
    state.claims = NAMED_USER;
    const res = await updateSession(req("/api/grade", "POST"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("never bounces an authenticated-but-unnamed user's API call to onboarding", async () => {
    state.claims = { sub: "user-1" }; // no display name yet
    const res = await updateSession(req("/api/extract", "POST"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("updateSession — page routes (unchanged)", () => {
  it("redirects an unauthenticated page visit to /login", async () => {
    const res = await updateSession(req("/submit"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets a signed-in, named user reach a protected page", async () => {
    state.claims = NAMED_USER;
    const res = await updateSession(req("/submit"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a signed-in user without a name to onboarding for page routes", async () => {
    state.claims = { sub: "user-1" };
    const res = await updateSession(req("/submit"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/onboarding");
  });
});
