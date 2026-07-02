"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  APTLY_PRACTICE_LABEL,
  NOT_OFFICIAL_IB_LABEL,
  PRACTICE_FROM_FOCUS_LABEL,
} from "@/lib/assessment/display";
import { ASSESSMENT_FRAMEWORK_LABELS, ASSESSMENT_SKILL_LABELS } from "@/lib/assessment/taxonomy";
import { clientMessageForPracticeFailure } from "@/lib/ai/practice-errors";
import { createPracticeGenerationClient } from "@/lib/ai/practice-request";
import type { PracticeQuestion } from "@/lib/types";

/** Student-facing format line for a generated question (never a false paper claim). */
function practiceFormatLabel(pq: PracticeQuestion): string {
  if (pq.framework === "generic_practice") return `${pq.markTotal}-mark practice`;
  if (pq.framework === "paper2_short_analytic") return `${pq.markTotal}-mark short response`;
  return ASSESSMENT_FRAMEWORK_LABELS[pq.framework];
}

// ONE shared client (module scope): concurrent renders/mounts in this tab
// share a single in-flight request, so no duplicate paid calls can be issued.
// The server's reuse-first idempotency covers refreshes and other tabs.
const generationClient = createPracticeGenerationClient();

/**
 * Targeted practice (Practice Loop): Aptly generates ONE original question
 * from the student's canonical next focus. The server derives the target —
 * this page only asks for "the next question" and shows the result. It is
 * deliberately not an open-ended generator UI: "Generate another" appears
 * only after a question is shown, and it is the ONLY action that requests a
 * new paid generation — a refresh simply reopens the unanswered question.
 */
export default function PracticePage() {
  // Starts in the loading state: the student arrived by clicking "Practice
  // this focus", so the very first render already reflects the request.
  // `intent` carries the seq (one request per bump) and whether the student
  // explicitly asked for a replacement question.
  const [generating, setGenerating] = useState(true);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ seq: number; regenerate: boolean }>({
    seq: 0,
    regenerate: false,
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const outcome = await generationClient.request({ regenerate: intent.regenerate });
        if (!active) return;
        if (outcome.status === 200 && outcome.practiceQuestion !== null) {
          setQuestion(outcome.practiceQuestion);
        } else {
          setError(
            clientMessageForPracticeFailure(outcome.status, outcome.code, outcome.reference)
          );
        }
      } catch {
        if (active) setError(clientMessageForPracticeFailure(502, "practice_generation_failed"));
      } finally {
        if (active) setGenerating(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [intent]);

  // The explicit "Generate another question" action — the ONLY normal way to
  // request a replacement paid generation. Only reachable after the previous
  // question is shown (never a parallel call).
  const generateAnother = useCallback(() => {
    setGenerating(true);
    setError(null);
    setQuestion(null);
    setIntent((i) => ({ seq: i.seq + 1, regenerate: true }));
  }, []);

  // Retry after a failure keeps the student's last intent: retrying a failed
  // first load stays reuse-first (never a surprise extra generation), while
  // retrying a failed "Generate another" still asks for the replacement.
  const retry = useCallback(() => {
    setGenerating(true);
    setError(null);
    setIntent((i) => ({ seq: i.seq + 1, regenerate: i.regenerate }));
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Practice this focus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One original Aptly question, chosen from the evidence in your marked answers.
        </p>
      </div>

      {generating && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aptly is checking your next focus and preparing your practice question…
            </p>
          </CardContent>
        </Card>
      )}

      {!generating && error !== null && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-8">
            <div className="flex items-start gap-2 text-sm">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{error}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" variant="outline" onClick={retry}>
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
              <Link
                href="/submit"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Submit your own answer instead <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {!generating && error === null && question !== null && (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 bg-gradient-to-br from-accent/70 to-card p-6">
              <div className="flex items-center gap-2 text-accent-foreground">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {APTLY_PRACTICE_LABEL}
                </span>
              </div>
              <p className="text-base font-medium leading-relaxed">{question.question}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>{question.topicLabel}</Badge>
                <Badge>{ASSESSMENT_SKILL_LABELS[question.skill]}</Badge>
                <Badge>{practiceFormatLabel(question)}</Badge>
                <Badge>{question.markTotal} marks</Badge>
              </div>
              {question.sourceMaterial !== null && (
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Source material (Aptly-generated)
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {question.sourceMaterial}
                  </p>
                </div>
              )}
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Why this question?
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{question.why}</p>
              </div>
              <p className="text-xs text-muted-foreground">{NOT_OFFICIAL_IB_LABEL}</p>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/submit?practice=${question.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Start answer <ArrowRight className="h-4 w-4" />
            </Link>
            {/* Only offered once a question is shown — never an open generator. */}
            <Button variant="ghost" size="sm" onClick={generateAnother}>
              <RefreshCw className="h-3.5 w-3.5" />
              Generate another question
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{PRACTICE_FROM_FOCUS_LABEL}.</p>
        </>
      )}
    </div>
  );
}
