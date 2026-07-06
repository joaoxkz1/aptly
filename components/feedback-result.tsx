"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  CircleAlert,
  CircleCheck,
  FileText,
  History,
  Lightbulb,
  Loader2,
  PenLine,
  Quote,
  RotateCcw,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkSummary } from "@/components/assessment/mark-summary";
import { AssessmentComponents } from "@/components/assessment/assessment-components";
import { MarkBreakdown } from "@/components/assessment/mark-breakdown";
import { DiagramEvidenceCard } from "@/components/assessment/diagram-evidence-card";
import { DIAGRAM_REVIEW_UNAVAILABLE_NOTICE } from "@/lib/diagram/evidence";
import { SUBJECT_BADGE } from "@/lib/subjects";
import {
  SOURCE_MATERIAL_MISSING_NOTICE,
  isSourceMaterialMissing,
  presentedFeedback,
} from "@/lib/assessment/status";
import { revisionComparison } from "@/lib/assessment/revisions";
import {
  REVISION_ATTEMPT_LABEL,
  REVISION_SAVED_BODY,
  REVISION_SAVED_LABEL,
  shortSkillLabel,
} from "@/lib/assessment/display";
import type { NextFocus, RecurringMistakeSummary } from "@/lib/assessment/readiness";
import type { Attempt } from "@/lib/types";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function FeedbackResult({
  attempt,
  saveState,
  recurring,
  parentAttempt = null,
  nextFocus = null,
  tryAnotherLabel = "Try another answer",
  diagramReviewFailed = false,
  onRevise,
  onRetry,
  onTryAnother,
}: {
  attempt: Attempt;
  saveState: SaveState;
  /** Cross-attempt recurring-mistake summary (computed from saved attempts). */
  recurring?: RecurringMistakeSummary;
  /** The original attempt when THIS result is a revision of it. */
  parentAttempt?: Attempt | null;
  /** The canonical next focus, when one exists — enables "Practice this focus". */
  nextFocus?: NextFocus | null;
  /** Primary action label — the sample walkthrough uses "Try your own answer". */
  tryAnotherLabel?: string;
  /** A diagram photo was attached but its review failed (grading unaffected). */
  diagramReviewFailed?: boolean;
  /** Starts a revision of this (saved) answer. Omitted until it is saved. */
  onRevise?: () => void;
  onRetry: () => void;
  onTryAnother: () => void;
}) {
  const assessment = attempt.assessment ?? null;
  // Source-less Paper 2(g)/3(b): data use is UNAVAILABLE, not a weakness. The
  // canonical presentation helper (shared with the Learning log) strips any
  // source-data corrective wording from the model's feedback.
  const sourceMissing = assessment !== null && isSourceMaterialMissing(assessment);
  const f = presentedFeedback(attempt);

  // Revision of an earlier attempt: a restrained estimate comparison ONLY when
  // both are marked with matching totals and a compatible framework; otherwise
  // a neutral confirmation — never a numeric claim across unlike estimates.
  const isRevisionOf = parentAttempt !== null && attempt.parentAttemptId === parentAttempt.id;
  const comparison =
    isRevisionOf && parentAttempt !== null ? revisionComparison(parentAttempt, attempt) : null;

  return (
    <div className="flex flex-col gap-4">
      {isRevisionOf && (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {REVISION_ATTEMPT_LABEL}
              </p>
              {comparison !== null ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Previous estimate:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {comparison.previousFraction}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Revision estimate:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {comparison.revisionFraction}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Change:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {comparison.deltaLabel}
                    </span>
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {saveState === "saved"
                    ? `${REVISION_SAVED_LABEL} — ${REVISION_SAVED_BODY.charAt(0).toLowerCase()}${REVISION_SAVED_BODY.slice(1)}`
                    : "You revised this question after feedback."}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Revision of an earlier attempt — both stay in your learning log. Practice
                estimates, not an official grade change.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {assessment !== null ? (
        <>
          {/* Header → recognised component structure (4-mark diagram only) →
              qualitative diagnostic feedback */}
          <MarkSummary attempt={attempt} />
          <AssessmentComponents attempt={attempt} />
          <MarkBreakdown assessment={assessment} />
        </>
      ) : (
        /* Legacy attempt (no assessment) — conservative header, no score or band */
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-2 bg-gradient-to-br from-accent/70 to-card p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Earlier attempt
            </p>
            <h2 className="text-lg font-semibold tracking-tight">Saved before mark estimates</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              This answer was saved before Aptly estimated marks. It stays in your learning log, but
              has no score.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge className={SUBJECT_BADGE[attempt.subject]}>{attempt.subject}</Badge>
              <Badge>{attempt.topic}</Badge>
            </div>
          </div>
        </Card>
      )}

      {/* Source-less data response: data use is unavailable, with a clear path
          (the exact same notice the Learning log shows) */}
      {sourceMissing && (
        <Card className="border-border bg-muted/40">
          <CardContent className="flex items-start gap-3 p-5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{SOURCE_MATERIAL_MISSING_NOTICE.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {SOURCE_MATERIAL_MISSING_NOTICE.body}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagram Evidence V1: image-based study feedback, rendered ONLY when a
          diagram photo was actually reviewed (never a "missing diagram" state)
          — the same shared card the Learning log shows. A failed review gets a
          gentle notice; it never blocks or alters the written feedback above. */}
      {attempt.diagramEvidence != null ? (
        <DiagramEvidenceCard evidence={attempt.diagramEvidence} />
      ) : (
        diagramReviewFailed && (
          <Card className="border-border bg-muted/40">
            <CardContent className="flex items-start gap-3 p-5">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                {DIAGRAM_REVIEW_UNAVAILABLE_NOTICE}
              </p>
            </CardContent>
          </Card>
        )
      )}

      {(f.strengths.length > 0 || f.improvements.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Strengths */}
          {f.strengths.length > 0 && (
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
          )}

          {/* Improvements */}
          {f.improvements.length > 0 && (
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
          )}
        </div>
      )}

      {/* Issues in THIS answer — single-answer evidence, honestly separated
          from cross-attempt recurring patterns (one weakness is never called
          "recurring"). */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {f.mistakes.length > 0 ? (
              <CircleAlert className="h-4 w-4 text-rose-500" />
            ) : (
              <CircleCheck className="h-4 w-4 text-emerald-500" />
            )}
            Issues in this answer
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
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
                No specific issues flagged in this answer.
              </p>
            )}
          </div>
          {recurring && (
            <p className="border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
              {recurring.state === "building" &&
                "Patterns are building. Submit more answers before Aptly identifies recurring mistakes."}
              {recurring.state === "none" && "No recurring mistake pattern found yet."}
              {recurring.state === "patterns" && (
                <>
                  <span className="font-medium text-foreground">
                    Recurring across your saved answers:
                  </span>{" "}
                  {recurring.patterns
                    .map((p) => `${p.type} (${p.attempts} answers)`)
                    .join(" · ")}
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Examiner comment */}
      {f.examinerComment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Quote className="h-4 w-4 text-muted-foreground" />
              Examiner-style comment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <blockquote className="border-l-2 border-primary/40 pl-4 text-sm italic leading-relaxed text-muted-foreground">
              {f.examinerComment}
            </blockquote>
          </CardContent>
        </Card>
      )}

      {/* Improve this answer — the fastest fix for THIS response, shown as the closing focus */}
      {f.studyNext && (
        <Card className="border-primary/25 bg-gradient-to-br from-accent/70 to-card">
          <CardContent className="flex items-start gap-3 p-5">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                Improve this answer
              </p>
              <p className="mt-1 text-sm leading-relaxed">{f.studyNext}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save status + actions */}
      <div className="flex flex-col gap-3">
        {saveState === "error" && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            <span className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4" />
              Couldn&apos;t save this attempt.
            </span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry save
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <BookOpenCheck className="h-4 w-4" />
              Saved to your learning log
            </span>
          )}
          <Button size="lg" onClick={onTryAnother}>
            <RotateCcw className="h-4 w-4" />
            {tryAnotherLabel}
          </Button>
          {/* Deliberately quieter than the feedback itself: act on this answer. */}
          {onRevise !== undefined && (
            <Button size="lg" variant="outline" onClick={onRevise}>
              <PenLine className="h-4 w-4" />
              Revise this answer
            </Button>
          )}
        </div>
        {/* Practice the evidence-backed focus — only when one actually exists. */}
        {nextFocus !== null && (
          <Link
            href="/practice"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Practice this focus: {shortSkillLabel(nextFocus.skillLabel)}{" "}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
