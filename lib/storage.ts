"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attempt } from "./types";
import { buildSeedAttempts } from "./seed";
import { createClient } from "./supabase/client";
import {
  clearAttempts,
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
    (attempt: Attempt) => {
      // Optimistic prepend for instant UX; persist in the background and
      // broadcast so all hooks resync with the authoritative server rows.
      setAttempts((prev) => [attempt, ...prev]);
      void (async () => {
        try {
          await insertAttempt(supabase, attempt);
        } finally {
          broadcast();
        }
      })();
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

  return { attempts, ready, addAttempt, clearAll, resetDemo };
}

export function newId() {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
