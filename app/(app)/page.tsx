"use client";

import Link from "next/link";
import {
  ArrowRight,
  Flame,
  PenLine,
  Send,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarList } from "@/components/bar-list";
import { Sparkline } from "@/components/sparkline";
import { ScoreRing } from "@/components/score-ring";
import { EconomicsLevelCard } from "@/components/assessment/economics-level-card";
import { useAttempts } from "@/lib/storage";
import {
  attemptsThisWeek,
  averageScore,
  currentStreak,
  scoreTrend,
  studyNextRecommendation,
  topicStats,
  weakestTopic,
} from "@/lib/analytics";
import { SUBJECT_BADGE, SUBJECT_COLORS } from "@/lib/subjects";
import { cn, formatDate } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { attempts, ready } = useAttempts();

  const week = attemptsThisWeek(attempts);
  const avg = averageScore(week);
  const streak = currentStreak(attempts);
  const weakest = weakestTopic(attempts);
  const rec = studyNextRecommendation(attempts);
  const stats = topicStats(attempts);
  const trend = scoreTrend(attempts);

  const byAttempts = [...stats]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((s) => ({
      label: s.topic,
      value: s.count,
      sublabel: `avg ${s.avgScore}`,
      colorClass: SUBJECT_COLORS[s.subject],
    }));

  const byMistakes = [...stats]
    .filter((s) => s.mistakes > 0)
    .sort((a, b) => b.mistakes - a.mistakes)
    .slice(0, 5)
    .map((s) => ({
      label: s.topic,
      value: s.mistakes,
      colorClass: "bg-rose-400 dark:bg-rose-500",
    }));

  const recent = attempts.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting()}, Joao
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is where your IB preparation stands this week.
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

      {/* Weekly stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Send className="h-4 w-4" />
              <span className="text-xs font-medium">Questions this week</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {ready ? week.length : "–"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              across {stats.length} topic{stats.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <EconomicsLevelCard attempts={attempts} ready={ready} />
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
              <TriangleAlert className="h-4 w-4" />
              <span className="text-xs font-medium">Weakest topic</span>
            </div>
            <p className="mt-2 truncate text-lg font-semibold leading-9">
              {weakest?.topic ?? "–"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {weakest != null ? `avg ${weakest.avgScore}/7` : "no attempts yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Study Next + trend */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-primary/25 bg-gradient-to-br from-accent/80 to-card lg:col-span-2">
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-center gap-2 text-accent-foreground">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Study next</span>
            </div>
            {rec !== null ? (
              <>
                <h2 className="text-xl font-semibold tracking-tight">
                  Study {rec.topic} next
                </h2>
                <p className="max-w-prose text-sm text-muted-foreground">{rec.reason}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Badge className={SUBJECT_BADGE[rec.subject]}>{rec.subject}</Badge>
                  <Link
                    href="/submit"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Practise it now <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Submit your first answer and Aptly will tell you what to study next.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Score trend
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            <Sparkline values={trend} width={170} height={56} />
            {avg !== null && <ScoreRing score={avg} size={56} />}
          </CardContent>
        </Card>
      </div>

      {/* Topic charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attempts by topic</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={byAttempts} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mistakes by topic</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={byMistakes} />
          </CardContent>
        </Card>
      </div>

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
                <p className="truncate text-sm font-medium">{a.topic}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.feedback.mistakes[0] ?? "No mistakes detected"}
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
