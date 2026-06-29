"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CircleAlert,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarList } from "@/components/bar-list";
import { useAttempts } from "@/lib/storage";
import { mistakeCounts, mostImprovedTopic, topicStats } from "@/lib/analytics";
import {
  assessedAttempts,
  assessmentStudyNext,
  assessmentTopicRecommendation,
  marksLostByCategory,
  performanceByFormat,
  skillCoverage,
} from "@/lib/assessment/readiness";
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
  // Assessment-aware weakest-topic advice (controlled syllabus codes only);
  // null until there is enough varied, reliable evidence.
  const topicRec = assessmentTopicRecommendation(attempts);

  // Assessment-aware analytics (Economics attempts that carry an assessment).
  const hasAssessment = assessedAttempts(attempts).length > 0;
  const formatsPerf = performanceByFormat(attempts);
  const marksLost = marksLostByCategory(attempts);
  const coverage = skillCoverage(attempts);
  const assessmentRec = assessmentStudyNext(attempts);

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
                {topicRec !== null ? (
                  <>
                    <p className="text-sm leading-relaxed">
                      Focus your next session on{" "}
                      <span className="font-semibold">{topicRec.topicLabel}</span>. {topicRec.reason}
                    </p>
                    <Link
                      href="/submit"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      Practise it now <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      You need a little more varied practice before Aptly can identify a reliable
                      weak topic. Try another Economics topic, then answer a second question in each
                      topic.
                    </p>
                    <Link
                      href="/submit"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      Try another topic <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* --- Exam-readiness insights (assessment-aware) --- */}
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Exam-readiness insights
            </h2>
            <span className="text-xs text-muted-foreground">· estimated, not official IB grades</span>
          </div>

          {!hasAssessment ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Grade Economics answers to unlock performance by question format, where marks are
                being lost, and skill coverage.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {/* Performance by question format */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      Performance by question format
                    </CardTitle>
                    <CardDescription>Weighted mark % on fully-marked answers</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {formatsPerf.length > 0 ? (
                      formatsPerf.map((f) => (
                        <div key={f.format}>
                          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{f.label}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {f.percent}% · {f.responses} response{f.responses === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${f.percent}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Limited data — grade a few more fully-marked answers.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Where marks are being lost */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-rose-500" />
                      Where marks are being lost
                    </CardTitle>
                    <CardDescription>Marks dropped by category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {marksLost.length > 0 ? (
                      <BarList
                        data={marksLost.map((l) => ({
                          label: l.label,
                          value: l.lost,
                          sublabel: `of ${l.available}`,
                          colorClass: "bg-rose-400 dark:bg-rose-500",
                        }))}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Limited data — no marked breakdowns yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {/* Coverage */}
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
                      <div
                        key={c.skill}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className={c.responses === 0 ? "text-muted-foreground" : "font-medium"}>
                          {c.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {c.responses === 0 ? "not yet" : `${c.responses}×`}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Upgraded Study Next */}
                <Card className="border-primary/25 bg-gradient-to-br from-accent/70 to-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-accent-foreground">
                      <Sparkles className="h-4 w-4" />
                      Study next
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {assessmentRec !== null ? (
                      <>
                        <p className="text-sm leading-relaxed">{assessmentRec}</p>
                        <Link
                          href="/submit"
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                          Practise it now <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Grade a few fully-marked answers to get a targeted recommendation.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
