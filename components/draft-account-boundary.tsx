"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { userIdFromClient } from "@/lib/auth/verified-user";
import { setDraftAccount } from "@/lib/drafts/session-draft";
import { Button } from "@/components/ui/button";

const AccountContext = createContext<string | null>(null);
const VERIFICATION_TIMEOUT_MS = 10_000;
export function useDraftAccount() { return useContext(AccountContext); }

/** Lives across navigation; account changes tear down all old editor state. */
export function DraftAccountBoundary({ children }: { children: React.ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let expected: string | null | undefined;
    let confirmed: string | null = null;
    let sequence = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    function clearTimers() {
      clearTimeout(timeout);
      clearTimeout(deferred);
    }
    function failed(request: number) {
      if (!active || request !== sequence) return;
      clearTimers();
      ++sequence; // A timed-out verification cannot unlock the editor later.
      setAccountId(null);
      setVerificationError(true);
    }
    function watch(request: number) {
      timeout = setTimeout(() => failed(request), VERIFICATION_TIMEOUT_MS);
    }
    // INITIAL_SESSION can itself be delayed. Bound that wait as well as getClaims.
    watch(sequence);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const next = session?.user.id ?? null;
      if (next === expected && confirmed === next && event !== "SIGNED_OUT") return;
      clearTimers();
      const changedAccount = expected !== undefined && expected !== next;
      expected = next;
      confirmed = null;
      const request = ++sequence;
      if (changedAccount || next === null) setDraftAccount(null);
      setAccountId(null);
      setVerificationError(false);
      if (next === null) { failed(request); return; }
      watch(request);
      // Supabase auth callbacks run under its lock. Verify outside the callback.
      deferred = setTimeout(() => {
        if (!active || request !== sequence) return;
        void userIdFromClient(supabase).then(verified => {
          if (!active || request !== sequence) return;
          if (verified !== next) { failed(request); return; }
          clearTimers();
          setDraftAccount(verified);
          confirmed = verified;
          setAccountId(verified);
        }).catch(() => failed(request));
      }, 0);
    });
    return () => { active = false; ++sequence; clearTimers(); data.subscription.unsubscribe(); };
  }, [retry]);

  return <AccountContext.Provider value={accountId} key={accountId ?? "pending"}>
    {verificationError ? (
      <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        <p>We couldn&apos;t confirm your account. Retry the check to continue.</p>
        <Button variant="outline" size="sm" onClick={() => { setVerificationError(false); setRetry(value => value + 1); }}>
          Retry account check
        </Button>
      </div>
    ) : children}
  </AccountContext.Provider>;
}
