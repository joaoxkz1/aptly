import { describe, expect, it } from "vitest";
import type { Attempt } from "./types";
import {
  INITIAL_ATTEMPTS_STATE,
  reduceAttemptsState,
  type AttemptsState,
} from "./storage-state";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const attemptA = { id: "a", topic: "A" } as Attempt;
const attemptB = { id: "b", topic: "B" } as Attempt;

describe("attempt loading state", () => {
  it("moves initial authenticated load to a genuine ready-empty state", () => {
    let state = reduceAttemptsState(INITIAL_ATTEMPTS_STATE, {
      type: "auth_changed",
      userId: USER_A,
    });
    state = reduceAttemptsState(state, { type: "load_started", userId: USER_A, requestId: 1 });
    state = reduceAttemptsState(state, {
      type: "load_succeeded",
      userId: USER_A,
      requestId: 1,
      attempts: [],
    });
    expect(state).toMatchObject({ status: "ready", attempts: [], userId: USER_A });
  });

  it("clears known rows immediately on account change", () => {
    const readyA = {
      attempts: [attemptA],
      status: "ready" as const,
      userId: USER_A,
      requestId: 1,
    };
    const switched = reduceAttemptsState(readyA, { type: "auth_changed", userId: USER_B });
    expect(switched).toMatchObject({ attempts: [], status: "loading", userId: USER_B });
  });

  it("ignores a late success from the previous account and an older generation", () => {
    let state = reduceAttemptsState(INITIAL_ATTEMPTS_STATE, {
      type: "auth_changed",
      userId: USER_A,
    });
    state = reduceAttemptsState(state, { type: "load_started", userId: USER_A, requestId: 1 });
    state = reduceAttemptsState(state, { type: "auth_changed", userId: USER_B });
    state = reduceAttemptsState(state, { type: "load_started", userId: USER_B, requestId: 2 });
    state = reduceAttemptsState(state, {
      type: "load_succeeded",
      userId: USER_A,
      requestId: 1,
      attempts: [attemptA],
    });
    expect(state.attempts).toEqual([]);
    state = reduceAttemptsState(state, {
      type: "load_succeeded",
      userId: USER_B,
      requestId: 2,
      attempts: [attemptB],
    });
    expect(state.attempts).toEqual([attemptB]);
  });

  it("keeps same-user known data on refresh failure", () => {
    const ready = {
      attempts: [attemptA],
      status: "ready" as const,
      userId: USER_A,
      requestId: 1,
    };
    const loading = reduceAttemptsState(ready, {
      type: "load_started",
      userId: USER_A,
      requestId: 2,
    });
    const failed = reduceAttemptsState(loading, {
      type: "load_failed",
      userId: USER_A,
      requestId: 2,
    });
    expect(failed).toMatchObject({ attempts: [attemptA], status: "error" });
  });

  it("represents sign-out as unauthorized, never ready-empty", () => {
    const state = reduceAttemptsState(
      { ...INITIAL_ATTEMPTS_STATE, userId: USER_A, attempts: [attemptA] },
      { type: "auth_changed", userId: null }
    );
    expect(state).toMatchObject({ attempts: [], status: "unauthorized" });
  });

  it("recovers from a same-user network failure on a newer retry", () => {
    let state: AttemptsState = {
      attempts: [attemptA],
      status: "error" as const,
      userId: USER_A,
      requestId: 1,
    };
    state = reduceAttemptsState(state, {
      type: "load_started",
      userId: USER_A,
      requestId: 2,
    });
    state = reduceAttemptsState(state, {
      type: "load_succeeded",
      userId: USER_A,
      requestId: 2,
      attempts: [attemptA, attemptB],
    });
    expect(state).toMatchObject({ status: "ready", attempts: [attemptA, attemptB] });
  });
});
