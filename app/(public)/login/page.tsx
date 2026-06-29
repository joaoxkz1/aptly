"use client";

import { Suspense, useState } from "react";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim() === "" || status === "sending") return;
    setError(null);
    setStatus("sending");

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Dynamic origin: works on localhost now and on a hosted domain later.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setStatus("idle");
      setError(signInError.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="p-6 pt-6">
        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <MailCheck className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              We sent a magic sign-in link to{" "}
              <span className="font-medium text-foreground">{email.trim()}</span>. Open it
              on this device to finish signing in.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => setStatus("idle")}
            >
              Use a different email
            </Button>
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
        fallback={<Card className="h-64 w-full max-w-sm animate-pulse" />}
      >
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Your IB study analytics copilot.
      </p>
    </div>
  );
}
