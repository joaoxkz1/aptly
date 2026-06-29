"use client";

import {
  BookOpenCheck,
  Check,
  CircleAlert,
  Lightbulb,
  Quote,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/score-ring";
import { MarkSummary } from "@/components/assessment/mark-summary";
import { MarkBreakdown } from "@/components/assessment/mark-breakdown";
import { SUBJECT_BADGE } from "@/lib/subjects";
import type { Attempt } from "@/lib/types";

export function FeedbackResult({
  attempt,
  saved,
  onSave,
  onTryAnother,
}: {
  attempt: Attempt;
  saved: boolean;
  onSave: () => void;
  onTryAnother: () => void;
}) {
  const f = attempt.feedback;
  const assessment = attempt.assessment ?? null;

  return (
    <div className="flex flex-col gap-4">
      {assessment !== null ? (
        <>
          {/* Assessment-aware header + per-category breakdown */}
          <MarkSummary assessment={assessment} subject={attempt.subject} topic={attempt.topic} />
          <MarkBreakdown assessment={assessment} />
        </>
      ) : (
        /* Legacy header (no assessment) — unchanged */
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-5 bg-gradient-to-br from-accent/70 to-card p-6 sm:flex-row sm:items-center">
            <ScoreRing score={f.score} size={96} />
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Grade band
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{f.band}</h2>
              <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge className={SUBJECT_BADGE[attempt.subject]}>{attempt.subject}</Badge>
                <Badge>{attempt.topic}</Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Strengths */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {f.strengths.map((s) => (
                <li key={s} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Improvements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Lightbulb className="h-4 w-4" />
              Improvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {f.improvements.map((s) => (
                <li key={s} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Mistake types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-rose-500" />
            Mistake types detected
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {f.mistakes.length > 0 ? (
            f.mistakes.map((m) => (
              <Badge
                key={m}
                className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
              >
                {m}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No recurring mistake patterns detected in this answer. Well done.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Examiner comment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-muted-foreground" />
            Examiner comment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <blockquote className="border-l-2 border-primary/40 pl-4 text-sm italic leading-relaxed text-muted-foreground">
            {f.examinerComment}
          </blockquote>
        </CardContent>
      </Card>

      {/* Study next */}
      <Card className="border-primary/25 bg-gradient-to-br from-accent/70 to-card">
        <CardContent className="flex items-start gap-3 p-5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
              Study next
            </p>
            <p className="mt-1 text-sm leading-relaxed">{f.studyNext}</p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onSave} disabled={saved} size="lg">
          {saved ? <BookOpenCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved to your log" : "Save attempt"}
        </Button>
        <Button variant="outline" size="lg" onClick={onTryAnother}>
          <RotateCcw className="h-4 w-4" />
          Try another answer
        </Button>
      </div>
    </div>
  );
}
