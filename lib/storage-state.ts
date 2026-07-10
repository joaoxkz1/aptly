import type { Attempt } from "./types";

export type AttemptsLoadStatus = "loading" | "ready" | "unauthorized" | "error";

export interface AttemptsState {
  attempts: Attempt[];
  status: AttemptsLoadStatus;
  userId: string | null;
  requestId: number;
}

export type AttemptsStateEvent =
  | { type: "auth_changed"; userId: string | null }
  | { type: "load_started"; userId: string; requestId: number }
  | { type: "load_succeeded"; userId: string; requestId: number; attempts: Attempt[] }
  | { type: "load_failed"; userId: string; requestId: number };

export const INITIAL_ATTEMPTS_STATE: AttemptsState = {
  attempts: [],
  status: "loading",
  userId: null,
  requestId: 0,
};

/**
 * Account-aware load state. A user change clears data synchronously; a
 * same-user refresh/error keeps known rows. Request identity prevents a slow
 * response from an earlier account/generation from overwriting current UI.
 */
export function reduceAttemptsState(
  state: AttemptsState,
  event: AttemptsStateEvent
): AttemptsState {
  if (event.type === "auth_changed") {
    if (event.userId === state.userId) return state;
    return {
      attempts: [],
      status: event.userId === null ? "unauthorized" : "loading",
      userId: event.userId,
      requestId: state.requestId,
    };
  }
  if (event.type === "load_started") {
    if (event.userId !== state.userId) return state;
    return { ...state, status: "loading", requestId: event.requestId };
  }
  if (event.userId !== state.userId || event.requestId !== state.requestId) return state;
  if (event.type === "load_succeeded") {
    return { ...state, attempts: event.attempts, status: "ready" };
  }
  return { ...state, status: "error" };
}
