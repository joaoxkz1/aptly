"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchCurrentFocusPracticeIds } from "@/lib/supabase/practice-questions";
import { createClient } from "@/lib/supabase/client";
import type { Attempt } from "@/lib/types";
import { deriveOnboardingProgress } from "@/lib/assessment/onboarding";

export function GettingStartedCard({ attempts }: { attempts: Attempt[] }) {
  const [focusPracticeIds, setFocusPracticeIds] = useState<Set<string>>(new Set());
  const linkedIds = useMemo(
    () => [
      ...new Set(
        attempts.flatMap((attempt) =>
          attempt.practiceQuestionId == null ? [] : [attempt.practiceQuestionId]
        )
      ),
    ],
    [attempts]
  );

  useEffect(() => {
    if (linkedIds.length === 0) return;
    const supabase = createClient();
    let active = true;
    fetchCurrentFocusPracticeIds(supabase, linkedIds)
      .then((ids) => {
        if (active) setFocusPracticeIds(ids);
      })
      .catch(() => {
        // The checklist stays conservative if this nonessential read fails.
      });
    return () => {
      active = false;
    };
  }, [linkedIds]);

  const progress = deriveOnboardingProgress(attempts, focusPracticeIds);
  const steps = [
    {
      label: "Submit your first marked answer",
      done: progress.firstMarkedAnswer,
    },
    {
      label: "Revise an answer",
      done: progress.completedRevision,
    },
    {
      label: "Answer a question from Current Focus",
      done: progress.answeredCurrentFocusPractice,
    },
  ];
  if (progress.complete) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div>
          <p className="text-sm font-semibold">Getting started · {progress.completed}/3</p>
          {steps[0].done && (
            <p className="mt-1 text-xs text-muted-foreground">
              Your first answer is now part of your learning profile.
            </p>
          )}
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-2">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={step.done ? "text-muted-foreground" : undefined}>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
