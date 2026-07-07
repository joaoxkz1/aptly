"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Layers, LineChart, PenLine, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";
import { MarkPill } from "@/components/assessment/mark-pill";
import { EconomicsLevelCard } from "@/components/assessment/economics-level-card";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { MarkBar } from "@/components/ui/mark-bar";
import { useAttempts } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { readDisplayName } from "@/lib/auth/display-name";
import { attemptsThisWeek, currentStreak } from "@/lib/analytics";
import { buildLearningInsights, stateBreakdown } from "@/lib/assessment/readiness";
import {
  LATEST_ATTEMPT_PER_QUESTION_NOTE,
  TOPICS_WITH_ESTIMATES_CAPTION,
  TOPICS_WITH_ESTIMATES_TITLE,
  WEIGHTED_PERCENT_EXPLANATION,
  attemptMetaLine,
  feedbackOnlyCountLabel,
  topicDisplayLabel,
  topicShortLabel,
  withConfirmedTotalsLabel,
  withInferredTotalLabel,
} from "@/lib/assessment/display";
import { SUBJECT_BADGE } from "@/lib/subjects";
import { cn, formatDate } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { attempts, ready } = useAttempts();
  const insights = buildLearningInsights(attempts);
  const week = attemptsThisWeek(attempts);
  // Complete, reconciling breakdown of THIS WEEK's submissions (sums to week.length).
  const weekly = stateBreakdown(week);
  const streak = currentStreak(attempts);
  const recent = attempts.slice(0, 5);

  // Resolve the signed-in user's chosen name for the greeting. Until it loads
  // we show a neutral "Welcome back" rather than risk the wrong name.
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setDisplayName(readDisplayName(data.session?.user?.user_metadata));
    });
    return () => {
      active = false;
    };
  }, []);
  const heading = displayName ? `${greeting()}, ${displayName}` : "Welcome back";

  // Strong first-time state instead of empty charts / confusing zeroes.
  // ONE clear call to action — the primary button below (the strongest of the
  // two previously duplicated CTAs).
  if (ready && attempts.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aptly learns your IB Economics patterns from every answer you submit.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Paste any Economics question and your answer. Aptly estimates the mark, breaks down
              where marks are won and lost, and tracks your progress privately.
            </p>
            <Link
              href="/submit"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <PenLine className="h-4 w-4" />
              Submit your first answer
            </Link>
            {/* Low-friction cold-start path: see real example feedback before
                writing anything — nothing is graded or saved on that route. */}
            <Link
              href="/submit?sample=1"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Or see sample feedback first — no writing needed
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is where your IB Economics preparation stands.
          </p>
        </div>
        <Link
          href="/submit"
          className="hidden h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 sm:inline-flex"
        >
          <PenLine className="h-4 w-4" />
          Submit an answer
        </Link>
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Send className="h-4 w-4" />
              <span className="text-xs font-medium">Submitted this week</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{ready ? week.length : "–"}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {ready
                ? [
                    withConfirmedTotalsLabel(weekly.confirmed),
                    weekly.provisional > 0 ? withInferredTotalLabel(weekly.provisional) : null,
                    weekly.feedbackOnly > 0 ? feedbackOnlyCountLabel(weekly.feedbackOnly) : null,
                    weekly.unscored > 0 ? `${weekly.unscored} earlier (no mark data)` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : withConfirmedTotalsLabel(0)}
            </p>
          </CardContent>
        </Card>
        <EconomicsLevelCard
          level={insights.level}
          ready={ready}
          provisionalCount={insights.provisionalCount}
          feedbackOnlyCount={insights.feedbackOnlyCount}
        />
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flame className="h-4 w-4" />
              <span className="text-xs font-medium">Current streak</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {ready ? streak : "–"}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                day{streak === 1 ? "" : "s"}
              </span>
            </p>
            {/* The streak counts consecutive DAYS with an answer (yesterday
                keeps it alive), so 0 can honestly sit beside a busy week —
                the caption states the rule instead of looking contradictory. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {ready && streak === 0
                ? "days in a row with an answer — submit today to start one"
                : "keep it going today"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-xs font-medium">{TOPICS_WITH_ESTIMATES_TITLE}</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {ready ? insights.distinctTopics : "–"}
            </p>
            {/* All-time provisional/feedback-only context lives on the level card
                (same time basis as the level); this card stays purely about
                topics with confirmed-total estimates so the counts never appear
                to mismatch. */}
            <p className="mt-1 text-xs text-muted-foreground">{TOPICS_WITH_ESTIMATES_CAPTION}</p>
          </CardContent>
        </Card>
      </div>

      {/* Hero recommendation + mark trend */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextFocusCard insights={insights} variant="hero" ready={ready} />
        </div>
        {/* At lg+ the grid stretches this card to match the (taller) next-focus
            hero; the flex-1 content then vertically centres the chart and its
            weighted metric in that height instead of leaving a blank band
            beneath a top-stuck chart. The chart keeps its fixed size, and
            below lg (natural card height) the layout is unchanged. */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-muted-foreground" />
              Mark trend
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3 lg:flex-1 lg:items-center">
            {insights.markTrend.length >= 3 ? (
              <>
                <Sparkline values={insights.markTrend} max={100} width={170} height={56} />
                {insights.weightedPercent !== null && (
                  <div className="text-right" title={WEIGHTED_PERCENT_EXPLANATION}>
                    <p className="text-2xl font-semibold tabular-nums">
                      {insights.weightedPercent}%
                    </p>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      weighted toward
                      <br />
                      recent answers
                    </p>
                  </div>
                )}
              </>
            ) : ready ? (
              <p className="text-sm text-muted-foreground">
                Grade a few more marked answers to see your mark trend.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Topic performance (canonical) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Topic performance</CardTitle>
            <CardDescription>
              Marks earned across your assessed topics · {LATEST_ATTEMPT_PER_QUESTION_NOTE}
            </CardDescription>
          </div>
          <Link href="/analytics" className="text-xs font-medium text-primary hover:underline">
            View analytics
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {insights.topicPerformance.length > 0 ? (
            insights.topicPerformance.slice(0, 6).map((t, i) => (
              <div key={t.topicCode}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium" title={t.topicLabel}>
                    {topicShortLabel(t.topicCode)}
                  </span>
                  {/* Always the evidence count, with an early-signal qualifier —
                      the same slot never alternates between two label kinds. */}
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t.percent}% · {t.responses} answer{t.responses === 1 ? "" : "s"}
                    {t.reliability === "early_signal" ? " · early signal" : ""}
                  </span>
                </div>
                <MarkBar percent={t.percent} delayMs={i * 60} />
              </div>
            ))
          ) : ready ? (
            <p className="text-sm text-muted-foreground">
              Grade Economics answers to see topic performance.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Recent answers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent answers</CardTitle>
          <Link href="/attempts" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {recent.map((a) => {
            const topic =
              a.assessment != null && a.assessment.syllabusTopic !== "unknown"
                ? topicDisplayLabel(a.assessment.syllabusTopic)
                : a.assessment?.topicLabel || a.topic;
            return (
              <div key={a.id} className="flex items-center gap-4 py-3 first:pt-1 last:pb-1">
                <MarkPill attempt={a} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{topic}</p>
                  <p className="truncate text-xs text-muted-foreground">{attemptMetaLine(a)}</p>
                </div>
                <Badge className={cn("hidden sm:inline-flex", SUBJECT_BADGE[a.subject])}>
                  {a.subject}
                </Badge>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {formatDate(a.createdAt)}
                </span>
              </div>
            );
          })}
          {ready && recent.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              Nothing here yet — submit your first answer to get started.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
