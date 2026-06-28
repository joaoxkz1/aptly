"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attempt } from "./types";
import { buildSeedAttempts } from "./seed";

const KEY = "aptly.attempts.v1";
const CHANGE_EVENT = "aptly:attempts-changed";

function read(): Attempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) {
      const seed = buildSeedAttempts();
      window.localStorage.setItem(KEY, JSON.stringify(seed));
      return sortDesc(seed);
    }
    return sortDesc(JSON.parse(raw) as Attempt[]);
  } catch {
    return [];
  }
}

function sortDesc(attempts: Attempt[]): Attempt[] {
  return [...attempts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function write(attempts: Attempt[]) {
  window.localStorage.setItem(KEY, JSON.stringify(attempts));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Single source of truth for attempts. Seeds demo data on first visit,
 * keeps every mounted component in sync via a window event.
 */
export function useAttempts() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setAttempts(read());
    sync();
    setReady(true);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const addAttempt = useCallback((attempt: Attempt) => {
    write([attempt, ...read()]);
  }, []);

  const clearAll = useCallback(() => {
    write([]);
  }, []);

  const resetDemo = useCallback(() => {
    write(buildSeedAttempts());
  }, []);

  return { attempts, ready, addAttempt, clearAll, resetDemo };
}

export function newId() {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
