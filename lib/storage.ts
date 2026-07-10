"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import { clearAttempts, deleteAttempt, fetchAttempts } from "./supabase/attempts";
import {
  INITIAL_ATTEMPTS_STATE,
  reduceAttemptsState,
  type AttemptsLoadStatus,
} from "./storage-state";

const CHANGE_EVENT = "aptly:attempts-changed";

export function broadcastAttemptsChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAttempts() {
  const [supabase] = useState(() => createClient());
  const [state, dispatch] = useReducer(reduceAttemptsState, INITIAL_ATTEMPTS_STATE);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (userId: string) => {
      const requestId = ++requestSequence.current;
      dispatch({ type: "load_started", userId, requestId });
      try {
        const attempts = await fetchAttempts(supabase);
        dispatch({ type: "load_succeeded", userId, requestId, attempts });
      } catch {
        dispatch({ type: "load_failed", userId, requestId });
      }
    },
    [supabase]
  );

  useEffect(() => {
    const onChange = () => {
      if (typeof userIdRef.current === "string") void load(userIdRef.current);
    };
    window.addEventListener(CHANGE_EVENT, onChange);

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      const changed = nextUserId !== userIdRef.current;
      userIdRef.current = nextUserId;
      if (changed) dispatch({ type: "auth_changed", userId: nextUserId });
      if (nextUserId !== null) void load(nextUserId);
    });

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      authSub.subscription.unsubscribe();
    };
  }, [load, supabase]);

  const retry = useCallback(() => {
    if (typeof userIdRef.current === "string") void load(userIdRef.current);
  }, [load]);

  const removeAttempt = useCallback(
    async (id: string): Promise<void> => {
      await deleteAttempt(supabase, id);
      broadcastAttemptsChanged();
    },
    [supabase]
  );

  const clearAll = useCallback(() => {
    void (async () => {
      try {
        await clearAttempts(supabase);
      } finally {
        broadcastAttemptsChanged();
      }
    })();
  }, [supabase]);

  const resetDemo = useCallback(() => {
    void (async () => {
      try {
        const response = await fetch("/api/demo/reset", { method: "POST" });
        if (!response.ok) throw new Error("demo reset failed");
      } finally {
        broadcastAttemptsChanged();
      }
    })();
  }, []);

  const status: AttemptsLoadStatus = state.status;
  return {
    attempts: state.attempts,
    status,
    ready: status !== "loading",
    retry,
    removeAttempt,
    clearAll,
    resetDemo,
  };
}
