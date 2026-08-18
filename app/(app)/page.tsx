"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Layers, LineChart, PenLine, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import { MarkPill } from "@/components/assessment/mark-pill";
import { EconomicsLevelCard } from "@/components/assessment/economics-level-card";
import { NextFocusCard } from "@/components/assessment/next-focus-card";
import { MarkBar } from "@/components/ui/mark-bar";
import { useAttempts } from "@/lib/storage";
import { AttemptsLoadNotice } from "@/components/attempts-load-notice";
import { EconomicsCourseSelector } from "@/components/economics-course-selector";
import { GettingStartedCard } from "@/components/onboarding/getting-started-card";
import { createClient } from "@/lib/supabase/client";
import { readDisplayName } from "@/lib/auth/display-name";
import {
  readEconomicsCourseLevel,
  type EconomicsCourseLevel,
} from "@/lib/assessment/course-level";
import { attemptsThisWeek, currentStreak } from "@/lib/analytics";
import { buildLearningInsights, stateBreakdown } from "@/lib/assessment/readiness";
import {
  LATEST_ATTEMPT_PER_QUESTION_NOTE,
  TOPICS_WITH_ESTIMATES_CAPTION,
  TOPICS_WITH_ESTIMATES_TITLE,
  WEIGHTED_PERCENT_EXPLANATION,
  attemptMetaLine,
  evidenceStrengthLabel,
  feedbackOnlyCountLabel,
  topicDisplayLabel,
  topicShortLabel,
  withConfirmedTotalsLabel,
  withInferredTotalLabel,
} from "@/lib/assessment/display";
import { formatDate } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { attempts, status, retry } = useAttempts();
  const ready = status === "ready" || (status === "error" && attempts.length > 0);
  const insights = buildLearningInsights(attempts);
  const week = attemptsThisWeek(attempts);
  // Complete, reconciling breakdown of THIS WEEK's submissions (sums to week.length).
  const weekly = stateBreakdown(week);
  const streak = currentStreak(attempts);
  const recent = attempts.slice(0, 5);

  // Resolve the signed-in user's chosen name for the greeting. Until it loads
  // we show a neutral "Welcome back" rather than risk the wrong name.
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [courseLevel, setCourseLevel] = useState<EconomicsCourseLevel | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setDisplayName(readDisplayName(data.session?.user?.user_metadata));
        setCourseLevel(readEconomicsCourseLevel(data.session?.user?.user_metadata));
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const heading = displayName ? `${greeting()}, ${displayName}` : "Welcome back";

  if (status !== "ready" && attempts.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aptly learns your IB Economics patterns from every answer you submit.
          </p>
        </div>
        <AttemptsLoadNotice status={status} hasData={false} onRetry={retry} />
      </div>
    );
  }

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
            <div>
              <h2 className="text-lg font-semibold">Welcome to Aptly</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Practice IB Economics answers, get IB-style feedback, and learn what to work on next.
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">First, choose your course:</p>
              <EconomicsCourseSelector
                key={courseLevel ?? "unset"}
                initialLevel={courseLevel}
                onSaved={setCourseLevel}
                compact
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Your learning profile starts with your first answer.
            </p>
            {courseLevel !== null && (
              <Link
                href="/practice"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                <PenLine className="h-4 w-4" />
                Generate my first question
              </Link>
            )}
            <Link
              href="/submit?sample=1"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              See sample feedback
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <AttemptsLoadNotice status={status} hasData onRetry={retry} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up your practice loop and keep the momentum going.
          </p>
        </div>
        <Link
          href="/submit"
          className="hidden h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 sm:inline-flex"
        >
          <PenLine className="h-4 w-4" />
          Write an answer
        </Link>
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
              Recent mark trend
            </CardTitle>
            <CardDescription>
              Last {insights.markTrend.length} marked answer{insights.markTrend.length === 1 ? "" : "s"} · 0–100% scale
            </CardDescription>
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
                      recent weighted
                      <br />
                      average
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

      {/* Compact supporting metrics — the recommended next action stays above them. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Send className="h-4 w-4" />
              <span className="text-xs font-semibold">This week</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{ready ? week.length : "–"}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {ready
                ? [
                    withConfirmedTotalsLabel(weekly.confirmed),
                    weekly.provisional > 0 ? withInferredTotalLabel(weekly.provisional) : null,
                    weekly.feedbackOnly > 0 ? feedbackOnlyCountLabel(weekly.feedbackOnly) : null,
                    weekly.unscored > 0 ? `${weekly.unscored} without mark data` : null,
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
        />
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flame className="h-4 w-4" />
              <span className="text-xs font-semibold">Practice streak</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {ready ? streak : "–"}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                day{streak === 1 ? "" : "s"}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ready && streak === 0 ? "Submit today to start" : "Keep it going today"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-xs font-semibold">{TOPICS_WITH_ESTIMATES_TITLE}</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {ready ? insights.distinctTopics : "–"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{TOPICS_WITH_ESTIMATES_CAPTION}</p>
          </CardContent>
        </Card>
      </div>

      <GettingStartedCard attempts={attempts} />

      {/* Topic performance (canonical) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Topic performance</CardTitle>
            <CardDescription>
              Marks earned across your assessed topics · {LATEST_ATTEMPT_PER_QUESTION_NOTE}
            </CardDescription>
          </div>
            <Link href="/analytics" className="text-xs font-semibold text-primary hover:underline">
              View progress
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {insights.topicPerformance.length > 0 ? (
            insights.topicPerformance.slice(0, 6).map((t, i) => (
              <div key={`${t.taxonomyVersion}:${t.topicCode}`}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium" title={t.topicLabel}>
                    {topicShortLabel(t.topicCode, t.taxonomyVersion)}
                  </span>
                  {/* Always the evidence count, with an early-signal qualifier —
                      the same slot never alternates between two label kinds. */}
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <span className={t.responses <= 2 ? "font-medium" : "font-semibold text-foreground"}>
                      {t.percent}%
                    </span>{" "}
                    · {t.responses} answer{t.responses === 1 ? "" : "s"}
                    {" · "}{evidenceStrengthLabel(t.responses).toLowerCase()}
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
                ? topicDisplayLabel(
                    a.assessment.syllabusTopic,
                    a.assessment.gradingProvenance?.taxonomyVersion
                  )
                : a.assessment?.topicLabel || a.topic;
            return (
              <div key={a.id} className="flex items-center gap-4 py-3 first:pt-1 last:pb-1">
                <MarkPill attempt={a} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{topic}</p>
                  <p className="truncate text-xs text-muted-foreground">{attemptMetaLine(a)}</p>
                </div>
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
