"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { MarkBar } from "@/components/ui/mark-bar";
import { useAttempts } from "@/lib/storage";
import { buildLearningInsights } from "@/lib/assessment/readiness";
import { shortTopicLabel } from "@/lib/assessment/display";

export default function AnalyticsPage() {
  const { attempts, ready } = useAttempts();
  const insights = buildLearningInsights(attempts);

  if (ready && attempts.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mistake analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated insight from your graded Economics answers — not official IB grades.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No data yet. Aptly learns from submitted answers.
            </p>
            <Link
              href="/submit"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Submit your first answer <ArrowUpRight className="h-4 w-4" />
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mistake analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimated practice insights from your graded Economics answers — not official IB grades.
        </p>
      </div>

      {/* One canonical global recommendation (identical to the Dashboard hero) */}
      <NextFocusCard insights={insights} />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Topic performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-500" />
              Topic performance
            </CardTitle>
            <CardDescription>Marks earned per topic · lowest relative first</CardDescription>
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
                      {shortTopicLabel(t.topicLabel)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.reliability === "reliable_pattern"
                        ? `Based on ${t.responses} answers`
                        : "Early signal"}{" "}
                      · {t.earned}/{t.available} marks
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

        {/* Where marks are being lost (ranked by % of available marks lost) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-rose-500" />
              Where marks are being lost
            </CardTitle>
            <CardDescription>% of available marks lost, by skill</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {skillPriority.length > 0 ? (
              skillPriority.slice(0, 6).map((s, i) => (
                <div key={s.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{s.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {s.percentLost}% lost · {s.lost}/{s.available}
                    </span>
                  </div>
                  <MarkBar
                    percent={s.percentLost}
                    colorClass="bg-rose-400 dark:bg-rose-500"
                    delayMs={i * 60}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No marked breakdowns yet — grade a few fully-marked answers.
              </p>
            )}
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
            <CardDescription>Mark % on fully-marked answers</CardDescription>
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
                Limited data — grade a few more fully-marked answers.
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
            <CardDescription>Skills you have practised</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {coverage.map((c) => (
              <div key={c.skill} className="flex items-center justify-between gap-2 text-sm">
                <span className={c.responses === 0 ? "text-muted-foreground" : "font-medium"}>
                  {c.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {c.responses === 0 ? "Not practised yet" : `${c.responses} practised`}
                </span>
              </div>
            ))}
            {(evidence.diagramRequiredMissing > 0 || evidence.workingsRequiredMissing > 0) && (
              <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                {evidence.diagramRequiredMissing > 0 && (
                  <>
                    {evidence.diagramRequiredMissing} answer
                    {evidence.diagramRequiredMissing === 1 ? "" : "s"} needed a diagram you
                    haven&apos;t submitted (photo upload arrives in a later release).{" "}
                  </>
                )}
                {evidence.workingsSubmitted > 0 && (
                  <>{evidence.workingsSubmitted} answer{evidence.workingsSubmitted === 1 ? "" : "s"} included typed workings.</>
                )}
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
                {shortTopicLabel(mostImproved.topicLabel)}
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
