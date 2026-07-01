"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Layers, LineChart, PenLine, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";
import { ScoreRing } from "@/components/score-ring";
import { EconomicsLevelCard } from "@/components/assessment/economics-level-card";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { MarkBar } from "@/components/ui/mark-bar";
import { useAttempts } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { readDisplayName } from "@/lib/auth/display-name";
import { attemptsThisWeek, currentStreak } from "@/lib/analytics";
import { buildLearningInsights } from "@/lib/assessment/readiness";
import { attemptMetaLine, shortTopicLabel } from "@/lib/assessment/display";
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
  if (ready && attempts.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aptly learns your IB Economics patterns from every answer you grade.
          </p>
        </div>
        <NextFocusCard insights={insights} variant="hero" />
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
              <span className="text-xs font-medium">Questions this week</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{ready ? week.length : "–"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {insights.validCount} marked overall
            </p>
          </CardContent>
        </Card>
        <EconomicsLevelCard
          level={insights.level}
          weightedPercent={insights.weightedPercent}
          ready={ready}
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
            <p className="mt-1 text-xs text-muted-foreground">keep it going today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-xs font-medium">Topics practised</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {ready ? insights.distinctTopics : "–"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">with marked evidence</p>
          </CardContent>
        </Card>
      </div>

      {/* Hero recommendation + mark trend */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextFocusCard insights={insights} variant="hero" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-muted-foreground" />
              Mark trend
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            {insights.markTrend.length >= 3 ? (
              <>
                <Sparkline values={insights.markTrend} max={100} width={170} height={56} />
                {insights.weightedPercent !== null && (
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums">
                      {insights.weightedPercent}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">weighted</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Grade a few more marked answers to see your mark trend.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Topic performance (canonical) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Topic performance</CardTitle>
            <CardDescription>Marks earned across your assessed topics</CardDescription>
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
                    {shortTopicLabel(t.topicLabel)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t.percent}% ·{" "}
                    {t.reliability === "reliable_pattern"
                      ? `${t.responses} answers`
                      : "early signal"}
                  </span>
                </div>
                <MarkBar percent={t.percent} delayMs={i * 60} />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Grade Economics answers to see topic performance.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent attempts */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent attempts</CardTitle>
          <Link href="/attempts" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {recent.map((a) => (
            <div key={a.id} className="flex items-center gap-4 py-3 first:pt-1 last:pb-1">
              <ScoreRing score={a.feedback.score} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.assessment?.topicLabel || a.topic}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.assessment != null
                    ? attemptMetaLine(a.assessment)
                    : a.feedback.mistakes[0] ?? "No recurring mistake pattern"}
                </p>
              </div>
              <Badge className={cn("hidden sm:inline-flex", SUBJECT_BADGE[a.subject])}>
                {a.subject}
              </Badge>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatDate(a.createdAt)}
              </span>
            </div>
          ))}
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
