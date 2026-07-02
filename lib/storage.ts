"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attempt } from "./types";
import { buildSeedAttempts } from "./seed";
import { createClient } from "./supabase/client";
import {
  clearAttempts,
  deleteAttempt,
  fetchAttempts,
  insertAttempt,
  seedAttempts,
} from "./supabase/attempts";

// In-tab signal so every mounted hook refetches after a mutation.
const CHANGE_EVENT = "aptly:attempts-changed";

function broadcast() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Single source of truth for attempts, now backed by Supabase.
 * The public API is unchanged from the localStorage version, so every page
 * keeps working untouched. Row Level Security scopes all reads/writes to the
 * signed-in user; a brand-new user starts with an empty list (Option A).
 */
export function useAttempts() {
  const [supabase] = useState(() => createClient());
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const rows = await fetchAttempts(supabase);
        if (active) setAttempts(rows);
      } catch {
        if (active) setAttempts([]);
      } finally {
        if (active) setReady(true);
      }
    };

    const onChange = () => {
      void load();
    };
    window.addEventListener(CHANGE_EVENT, onChange);

    // Fires INITIAL_SESSION once the client has loaded the session from
    // cookies, then on sign-in/out — guaranteeing we query with a valid token.
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, onChange);
      authSub.subscription.unsubscribe();
    };
  }, [supabase]);

  const addAttempt = useCallback(
    // Awaitable: resolves only after the row is persisted, throws on failure.
    // No optimistic prepend — the attempt appears everywhere only once the
    // write actually succeeds (then broadcast triggers a resync).
    async (attempt: Attempt): Promise<void> => {
      await insertAttempt(supabase, attempt);
      broadcast();
    },
    [supabase]
  );

  const removeAttempt = useCallback(
    // Awaitable: resolves only after the row is actually deleted, throws on
    // failure. NEVER optimistic — the attempt disappears from the log,
    // Dashboard, and Analytics only once the delete succeeds (the broadcast
    // then resyncs every mounted hook), so a failed delete keeps it visible.
    async (id: string): Promise<void> => {
      await deleteAttempt(supabase, id);
      broadcast();
    },
    [supabase]
  );

  const clearAll = useCallback(() => {
    setAttempts([]);
    void (async () => {
      try {
        await clearAttempts(supabase);
      } finally {
        broadcast();
      }
    })();
  }, [supabase]);

  const resetDemo = useCallback(() => {
    void (async () => {
      try {
        await clearAttempts(supabase);
        await seedAttempts(supabase, buildSeedAttempts());
      } finally {
        broadcast();
      }
    })();
  }, [supabase]);

  return { attempts, ready, addAttempt, removeAttempt, clearAll, resetDemo };
}

export function newId() {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
