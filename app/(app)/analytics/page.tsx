"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { MarkBar } from "@/components/ui/mark-bar";
import { useAttempts } from "@/lib/storage";
import { AttemptsLoadNotice } from "@/components/attempts-load-notice";
import { buildLearningInsights } from "@/lib/assessment/readiness";
import {
  DIAGNOSTIC_BAR_EXPLANATION,
  LATEST_ATTEMPT_PER_QUESTION_NOTE,
  diagnosticSignalStrength,
  diagramEvidenceNote,
  topicShortLabel,
} from "@/lib/assessment/display";

export default function AnalyticsPage() {
  const { attempts, status, retry } = useAttempts();
  const insights = buildLearningInsights(attempts);

  // Attempts still loading: a quiet placeholder instead of flashing the
  // empty-state copy ("No data yet", "Grade Economics answers…") at students
  // who already have saved answers.
  if (status !== "ready" && attempts.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mistake analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated practice insights from your graded Economics answers — not official IB
            grades.
          </p>
        </div>
        <AttemptsLoadNotice status={status} hasData={false} onRetry={retry} />
      </div>
    );
  }

  if (status === "ready" && attempts.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mistake analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated practice insights from your graded Economics answers — not official IB
            grades.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No data yet. Aptly learns from submitted answers.
            </p>
            {/* In-app navigation — never the external-link arrow. */}
            <Link
              href="/submit"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Submit your first answer <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { topicPerformance, skillPriority, formatPerformance, coverage, evidence, mostImproved } =
    insights;

  return (
    <div className="flex flex-col gap-5">
      <AttemptsLoadNotice status={status} hasData onRetry={retry} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mistake analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimated practice insights from your graded Economics answers — not official IB grades.
        </p>
      </div>

      {/* One canonical global recommendation (identical to the Dashboard hero) */}
      <NextFocusCard insights={insights} />

      {(insights.provisionalCount > 0 || insights.feedbackOnlyCount > 0) && (
        <p className="text-xs text-muted-foreground">
          {[
            insights.provisionalCount > 0
              ? `${insights.provisionalCount} answer${insights.provisionalCount === 1 ? "" : "s"} with an inferred total`
              : null,
            insights.feedbackOnlyCount > 0
              ? `${insights.feedbackOnlyCount} feedback-only answer${insights.feedbackOnlyCount === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          are saved and analysed, but only answers marked with a confirmed total feed the
          numbers below.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Topic performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-500" />
              Topic performance
            </CardTitle>
            <CardDescription>
              Marks earned per topic · lowest first · {LATEST_ATTEMPT_PER_QUESTION_NOTE}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {topicPerformance.length > 0 ? (
              topicPerformance.map((t, i) => (
                <div
                  key={t.topicCode}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={t.topicLabel}>
                      {topicShortLabel(t.topicCode)}
                    </p>
                    {/* Always the evidence count, with an early-signal qualifier —
                        never two different label kinds in the same slot. */}
                    <p className="text-xs text-muted-foreground">
                      Based on {t.responses} answer{t.responses === 1 ? "" : "s"}
                      {t.reliability === "early_signal" ? " · early signal" : ""} · {t.earned}/
                      {t.available} marks
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {t.percent}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Grade Economics answers across topics to see topic performance.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic focus by skill — Aptly's internal qualitative pattern.
            NEVER shown as marks, available marks, percentages, or ratios. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-rose-500" />
              Diagnostic focus by skill
            </CardTitle>
            <CardDescription>
              Where marks slipped away, by skill. {DIAGNOSTIC_BAR_EXPLANATION}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(() => {
              const gaps = skillPriority.filter((s) => s.lost > 0).slice(0, 6);
              if (gaps.length === 0) {
                return (
                  <div>
                    <p className="text-sm font-medium">No clear diagnostic gap yet</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Keep submitting marked answers to build a reliable skill pattern.
                    </p>
                  </div>
                );
              }
              return gaps.map((s, i) => {
                const signal = diagnosticSignalStrength(s.percentLost);
                return (
                  <div key={s.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{s.label}</span>
                      <span className="shrink-0 text-muted-foreground">{signal}</span>
                    </div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {s.responses === 1
                        ? "Observed in 1 marked answer"
                        : `Observed across ${s.responses} marked answers`}
                    </p>
                    <div role="img" aria-label={`${s.label}: ${signal}`}>
                      <MarkBar
                        percent={s.percentLost}
                        colorClass="bg-rose-400 dark:bg-rose-500"
                        delayMs={i * 60}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Section divider — restores two-tier hierarchy from 680ea3a */}
      <h2 className="mt-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Exam-readiness insights
      </h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Format performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Performance by question format
            </CardTitle>
            <CardDescription>
              Estimated mark % on marked answers · {LATEST_ATTEMPT_PER_QUESTION_NOTE}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {formatPerformance.length > 0 ? (
              formatPerformance.map((f, i) => (
                <div key={f.format}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{f.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {f.percent}% · {f.responses} response{f.responses === 1 ? "" : "s"}
                    </span>
                  </div>
                  <MarkBar percent={f.percent} delayMs={i * 60} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Limited data — grade a few more answers with confirmed totals.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Coverage (skills + diagram/workings evidence, kept distinct) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Coverage
            </CardTitle>
            {/* Deliberately a WIDER count than the marked-answer cards: it
                answers "what have I practised?", so revisions and answers
                without a confirmed total count too — and it says so. */}
            <CardDescription>
              Skills your questions have practised — counts every analysed answer, including
              revisions
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {coverage.map((c) => (
              <div key={c.skill} className="flex items-center justify-between gap-2 text-sm">
                <span className={c.responses === 0 ? "text-muted-foreground" : "font-medium"}>
                  {/* No diagram image is assessed this release — label the skill as
                      the written explanation, not a verified diagram. */}
                  {c.skill === "diagram_explanation" ? "Diagram-related written explanation" : c.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {c.responses === 0 ? "No clear evidence yet" : `${c.responses} observed`}
                </span>
              </div>
            ))}
            {evidence.diagramRequiredMissing > 0 && (
              <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  {diagramEvidenceNote(evidence.diagramRequiredMissing).title}.
                </span>{" "}
                {diagramEvidenceNote(evidence.diagramRequiredMissing).body}
              </p>
            )}
            {evidence.workingsSubmitted > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {evidence.workingsSubmitted}{" "}
                answer{evidence.workingsSubmitted === 1 ? "" : "s"} included typed workings.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Most improved — only shown once there is a real, evidence-backed result */}
      {mostImproved !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Most improved topic
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <p className="flex-1 text-lg font-semibold tracking-tight" title={mostImproved.topicLabel}>
                {mostImproved.topicLabel}
              </p>
              <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
                <span className="text-muted-foreground">{mostImproved.fromPercent}%</span>
                <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                <span className="text-emerald-500">{mostImproved.toPercent}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
