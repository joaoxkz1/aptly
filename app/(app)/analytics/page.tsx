"use client";

import Link from "next/link";
import { ArrowUpRight, CircleAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarList } from "@/components/bar-list";
import { useAttempts } from "@/lib/storage";
import {
  mistakeCounts,
  mostImprovedTopic,
  studyNextRecommendation,
  topicStats,
} from "@/lib/analytics";
import { SUBJECT_BADGE } from "@/lib/subjects";
import { scoreColor } from "@/components/score-ring";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const { attempts, ready } = useAttempts();

  const mistakes = mistakeCounts(attempts);
  const totalMistakes = mistakes.reduce((s, m) => s + m.count, 0);
  const stats = topicStats(attempts);
  const weakestThree = [...stats].sort((a, b) => a.avgScore - b.avgScore).slice(0, 3);
  const improved = mostImprovedTopic(attempts);
  const rec = studyNextRecommendation(attempts);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mistake analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Patterns across your {attempts.length} graded attempt{attempts.length === 1 ? "" : "s"} —
          this is what an examiner would tell you to fix first.
        </p>
      </div>

      {ready && attempts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No data yet. Submit a few answers and your mistake patterns will appear here.
            </p>
            <Link
              href="/submit"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Submit an answer <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Mistake type counts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleAlert className="h-4 w-4 text-rose-500" />
                  Mistake types
                </CardTitle>
                <CardDescription>
                  {totalMistakes} mistakes detected across all attempts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  data={mistakes.map((m) => ({
                    label: m.type,
                    value: m.count,
                    colorClass: "bg-rose-400 dark:bg-rose-500",
                  }))}
                />
              </CardContent>
            </Card>

            {/* Weakest topics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-500" />
                  Weakest topics
                </CardTitle>
                <CardDescription>Lowest average scores — prioritise these</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {weakestThree.map((s, i) => (
                  <div
                    key={`${s.subject}-${s.topic}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.topic}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.count} attempt{s.count === 1 ? "" : "s"} · {s.mistakes} mistake
                        {s.mistakes === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge className={SUBJECT_BADGE[s.subject]}>{s.subject}</Badge>
                    <span
                      className={cn("text-lg font-semibold tabular-nums", scoreColor(s.avgScore))}
                    >
                      {s.avgScore}
                    </span>
                  </div>
                ))}
                {weakestThree.length === 0 && (
                  <p className="text-sm text-muted-foreground">No topic data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* Most improved */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Most improved topic
                </CardTitle>
              </CardHeader>
              <CardContent>
                {improved !== null ? (
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold tracking-tight">{improved.topic}</p>
                      <Badge className={cn("mt-1", SUBJECT_BADGE[improved.subject])}>
                        {improved.subject}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
                      <span className="text-muted-foreground">{improved.from}</span>
                      <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                      <span className="text-emerald-500">{improved.to}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Attempt the same topic more than once to see improvement trends.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recommendation */}
            <Card className="border-primary/25 bg-gradient-to-br from-accent/70 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-accent-foreground">
                  <Sparkles className="h-4 w-4" />
                  What to do about it
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rec !== null ? (
                  <>
                    <p className="text-sm leading-relaxed">
                      Focus your next session on <span className="font-semibold">{rec.topic}</span>.{" "}
                      {rec.reason}
                    </p>
                    <Link
                      href="/submit"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      Practise it now <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No recommendation yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
