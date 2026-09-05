"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { userIdFromClient } from "@/lib/auth/verified-user";
import { setDraftAccount } from "@/lib/drafts/session-draft";

const AccountContext = createContext<string | null>(null);
export function useDraftAccount() { return useContext(AccountContext); }

/** Lives across navigation; account changes tear down all old editor state. */
export function DraftAccountBoundary({ children }: { children: React.ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let expected: string | null | undefined;
    let confirmed: string | null = null;
    let sequence = 0;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (next === expected && confirmed === next && event !== "SIGNED_OUT") return;
      const changedAccount = expected !== undefined && expected !== next;
      expected = next;
      confirmed = null;
      const request = ++sequence;
      if (changedAccount || next === null) setDraftAccount(null);
      setAccountId(null);
      if (next === null) return;
      // Supabase auth callbacks run under its lock. Verify outside the callback.
      setTimeout(() => {
        void userIdFromClient(supabase).then(verified => {
          if (!active || request !== sequence || verified !== next) return;
          setDraftAccount(verified);
          confirmed = verified;
          setAccountId(verified);
        }).catch(() => { /* No restore until authentication can be verified. */ });
      }, 0);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  return <AccountContext.Provider value={accountId} key={accountId ?? "pending"}>{children}</AccountContext.Provider>;
}
