"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/legal/operator";
import { clearBrowserDrafts } from "@/lib/drafts/session-draft";

export default function SettingsPage() {
  const [supabase] = useState(() => createClient());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      if (!response.ok) throw new Error("delete failed");
      clearBrowserDrafts();
      // Clear the local session directly: the account it belonged to no longer
      // exists, so a server-side sign-out would have nothing to revoke.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // The cookies are cleared by the full navigation below regardless.
      }
      // A FULL document navigation is deliberate here, not laziness: a soft
      // router.replace() would keep the React tree — and with it the cached
      // Supabase client and the in-memory attempts from the account that was
      // just deleted — alive. Tearing the document down is the only way to
      // guarantee no state from a deleted account survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?deleted=1");
    } catch {
      setDeleting(false);
      setError(
        `Couldn't delete your account just now. Please try again, or email ${CONTACT_EMAIL}.`
      );
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Your data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What Aptly does with your work, how to ask about it, and how to delete it.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-sm font-medium">Privacy Notice</p>
              <p className="text-xs text-muted-foreground">
                What Aptly saves, what OpenAI receives, and how long things are kept.
              </p>
            </div>
            <Link
              href="/privacy"
              className="shrink-0 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              View
            </Link>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Terms of Use</p>
              <p className="text-xs text-muted-foreground">
                The rules for using Aptly, and what it does and does not promise.
              </p>
            </div>
            <Link
              href="/terms"
              className="shrink-0 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              View
            </Link>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">Questions about your data?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Email{" "}
              <a
                href={CONTACT_MAILTO}
                className="font-medium text-primary hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              to ask for a copy of your information, correct something, or raise a privacy concern.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <div>
            <p className="text-sm font-medium">Delete account</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Deleting your account permanently removes your saved Aptly answers, feedback,
              practice history and account information. This cannot be undone.
            </p>
          </div>

          {error !== null && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {confirming ? (
            <div className="flex flex-col gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
              <p className="text-sm font-medium text-foreground">
                Delete your account and all saved Aptly data? This cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteAccount()}
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Delete permanently"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setConfirming(true);
                  setError(null);
                }}
              >
                Delete my account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
