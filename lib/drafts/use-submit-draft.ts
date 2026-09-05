"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { browserDraftStore, DraftSession, isDraftAccount, type DraftTask, type DraftText } from "./session-draft";

export function useSubmitDraft(accountId: string, task: DraftTask, initial: DraftText, ready: boolean, sample: boolean) {
  const [session] = useState(() => new DraftSession(accountId, task, browserDraftStore, initial,
    Date.now, () => crypto.randomUUID(), () => isDraftAccount(accountId)));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  useEffect(() => {
    if (!ready) return;
    session.open(!sample);
    return () => session.close();
  }, [session, ready, sample]);
  function edit(patch: Partial<DraftText>, persist = true) { session.edit(patch, persist); }
  function discard() { session.discard(); }
  return { ...state, session, edit, discard, refresh: session.refresh };
}
