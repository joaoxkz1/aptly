"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;

    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError("Please enter a name between 1 and 40 characters.");
      return;
    }

    setError(null);
    setStatus("saving");

    // Save into Supabase Auth user metadata — no table, no migration.
    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: trimmed },
    });
    if (updateError) {
      setStatus("idle");
      setError("Sorry — we couldn't save your name. Please try again.");
      return;
    }

    // updateUser leaves the current JWT stale, so refresh it — the route guard
    // reads the name from the verified JWT claims and would otherwise bounce
    // straight back here.
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      setStatus("idle");
      setError("Sorry — we couldn't finish setting up. Please try again.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Aptly</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="p-6 pt-6">
          <div className="mb-5">
            <h1 className="text-lg font-semibold tracking-tight">What should we call you?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This is how Aptly will greet you in your study space.
            </p>
          </div>

          {error !== null && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="given-name"
                autoFocus
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maya"
              />
            </div>
            <Button type="submit" size="lg" disabled={status === "saving"}>
              {status === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Continue to Aptly"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        A first name, nickname, or preferred name is perfect.
      </p>
    </div>
  );
}
