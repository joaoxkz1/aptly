"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CircleAlert,
  GraduationCap,
  Loader2,
  MailCheck,
  Send,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

// Client-side cooldown between magic-link sends (>= Supabase's own OTP rate limit).
const RESEND_COOLDOWN_SECONDS = 60;

function LoginForm() {
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth"
      ? "That sign-in link was invalid or expired. Please request a new one."
      : null
  );
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function sendLink(): Promise<boolean> {
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Dynamic origin: works on localhost now and on a hosted domain later.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (signInError) {
      setError(signInError.message);
      return false;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim() === "" || status === "sending") return;
    setError(null);
    setStatus("sending");
    const ok = await sendLink();
    setStatus(ok ? "sent" : "idle");
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    setResent(false);
    if (await sendLink()) setResent(true);
  }

  return (
    <Card className="w-full max-w-sm sm:max-w-[26.5rem]">
      <CardContent className="p-6 pt-6">
        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <MailCheck className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              We sent a magic sign-in link to{" "}
              <span className="font-medium text-foreground">{email.trim()}</span>. Open the link on
              the device where you want to continue using Aptly.
            </p>
            <p className="text-xs text-muted-foreground">
              Can&apos;t see it? Check your spam or junk folders.
            </p>
            {error !== null && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            {resent && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Link sent again.
              </p>
            )}
            <div className="mt-1 flex flex-col items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={handleResend} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend link"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("idle");
                  setResent(false);
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-lg font-semibold tracking-tight">Sign in to Aptly</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a magic link — no password needed.
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
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </div>
              <Button type="submit" size="lg" disabled={status === "sending"}>
                {status === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending link…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send magic link
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
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

      <Suspense
        fallback={<Card className="h-64 w-full max-w-sm animate-pulse sm:max-w-[26.5rem]" />}
      >
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Your IB study analytics copilot.
      </p>
    </div>
  );
}
