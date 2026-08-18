"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { EconomicsCourseSelector } from "@/components/economics-course-selector";
import {
  APTLY_PRACTICE_LABEL,
  NOT_OFFICIAL_IB_LABEL,
} from "@/lib/assessment/display";
import {
  ASSESSMENT_FRAMEWORK_LABELS,
  ASSESSMENT_SKILL_LABELS,
  CURRENT_SYLLABUS_TOPIC_LABELS,
  CURRENT_SYLLABUS_TOPIC_SHORT_LABELS,
  SYLLABUS_TOPICS,
  isCurrentTopLevelHlTopic,
} from "@/lib/assessment/taxonomy";
import {
  PRACTICE_MARK_TOTALS,
  readEconomicsCourseLevel,
  type EconomicsCourseLevel,
  type PracticeMarkTotal,
} from "@/lib/assessment/course-level";
import { clientMessageForPracticeFailure } from "@/lib/ai/practice-errors";
import { createPracticeGenerationClient } from "@/lib/ai/practice-request";
import { createClient } from "@/lib/supabase/client";
import type { PracticeQuestion } from "@/lib/types";

const generationClient = createPracticeGenerationClient();
const CURRENT_TOPICS = SYLLABUS_TOPICS.filter((topic) => topic !== "unknown");
const LAST_MARKS_KEY = "aptly:practice:last-marks";

function validMark(value: string | null): PracticeMarkTotal | null {
  const number = Number(value);
  return (PRACTICE_MARK_TOTALS as readonly number[]).includes(number)
    ? (number as PracticeMarkTotal)
    : null;
}

function validTopic(value: string | null): string | null {
  return value !== null && (CURRENT_TOPICS as readonly string[]).includes(value)
    ? value
    : null;
}

function practiceFormatLabel(question: PracticeQuestion): string {
  if (question.framework === "paper2_short_analytic") {
    return `${question.markTotal}-mark short response`;
  }
  return ASSESSMENT_FRAMEWORK_LABELS[question.framework];
}

function unitLabel(topicCode: string): string {
  return `Unit ${topicCode.split(".")[0]}`;
}

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <PracticeGenerator />
    </Suspense>
  );
}

function PracticeGenerator() {
  const params = useSearchParams();
  const requestedTopic = validTopic(params.get("topic"));
  const requestedMark = validMark(params.get("marks"));
  const fromCurrentFocus = params.get("focus") === "1";

  const [courseLevel, setCourseLevel] = useState<EconomicsCourseLevel | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingCourse, setEditingCourse] = useState(false);
  const [marks, setMarks] = useState<PracticeMarkTotal>(requestedMark ?? 10);
  const [topicCode, setTopicCode] = useState(requestedTopic ?? "1.1");
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (requestedMark === null) {
        const remembered = validMark(window.sessionStorage.getItem(LAST_MARKS_KEY));
        if (remembered !== null) setMarks(remembered);
      }
      setCourseLevel(readEconomicsCourseLevel(data.session?.user.user_metadata));
      setProfileLoading(false);
    });
    return () => {
      active = false;
    };
  }, [requestedMark]);

  const eligibleTopics = useMemo(
    () =>
      CURRENT_TOPICS.filter(
        (topic) => courseLevel !== "sl" || !isCurrentTopLevelHlTopic(topic)
      ),
    [courseLevel]
  );
  const selectedTopicCode =
    courseLevel === "sl" && isCurrentTopLevelHlTopic(topicCode) ? "2.9" : topicCode;

  const filteredByUnit = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const topics = eligibleTopics.filter((topic) => {
      if (topic === selectedTopicCode || needle === "") return true;
      const label = CURRENT_SYLLABUS_TOPIC_LABELS[topic];
      return topic.includes(needle) || label.toLowerCase().includes(needle);
    });
    return [1, 2, 3, 4].map((unit) => ({
      unit,
      topics: topics.filter((topic) => topic.startsWith(`${unit}.`)),
    }));
  }, [eligibleTopics, search, selectedTopicCode]);

  const generate = useCallback(
    async (regenerate = false) => {
      if (courseLevel === null || generating) return;
      setGenerating(true);
      setError(null);
      if (regenerate) setQuestion(null);
      try {
        const outcome = await generationClient.request({
          marks,
          topicCode: selectedTopicCode,
          context: fromCurrentFocus ? "current_focus" : "general",
          regenerate,
        });
        if (outcome.status === 200 && outcome.practiceQuestion !== null) {
          setQuestion(outcome.practiceQuestion);
        } else {
          setError(
            clientMessageForPracticeFailure(
              outcome.status,
              outcome.code,
              outcome.reference
            )
          );
        }
      } catch {
        setError(clientMessageForPracticeFailure(502, "practice_generation_failed"));
      } finally {
        setGenerating(false);
      }
    },
    [courseLevel, fromCurrentFocus, generating, marks, selectedTopicCode]
  );

  function chooseMarks(value: PracticeMarkTotal) {
    setMarks(value);
    setQuestion(null);
    setError(null);
    window.sessionStorage.setItem(LAST_MARKS_KEY, String(value));
  }

  function chooseTopic(value: string) {
    setTopicCode(value);
    setQuestion(null);
    setError(null);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Generate practice question
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the marks and topic. Aptly handles the question style.
          </p>
        </div>
        {!profileLoading && courseLevel !== null && (
          <div className="text-right text-xs text-muted-foreground">
            <p>
              Course: <span className="font-semibold text-foreground">{courseLevel.toUpperCase()}</span>
            </p>
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setEditingCourse((value) => !value)}
            >
              Change course
            </button>
          </div>
        )}
      </div>

      {profileLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your course…
          </CardContent>
        </Card>
      ) : courseLevel === null || editingCourse ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div>
              <h2 className="font-semibold">Choose your IB Economics course</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Aptly saves this once and uses it to keep every generated question relevant.
              </p>
            </div>
            <EconomicsCourseSelector
              key={courseLevel ?? "unset"}
              initialLevel={courseLevel}
              onSaved={(level) => {
                setCourseLevel(level);
                setEditingCourse(false);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {fromCurrentFocus && (
            <div className="rounded-xl border border-primary/25 bg-accent/40 px-4 py-3 text-sm text-muted-foreground">
              Your Current Focus topic is preselected. You can still change the topic or marks
              before generating.
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col gap-5 p-6">
              <fieldset>
                <legend className="text-sm font-medium">Marks</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRACTICE_MARK_TOTALS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={marks === value ? "primary" : "outline"}
                      aria-pressed={marks === value}
                      onClick={() => chooseMarks(value)}
                      className="min-w-16"
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <div>
                <Label htmlFor="topic-search">Topic</Label>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="topic-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search current syllabus topics"
                    className="pl-9"
                  />
                </div>
                <Label htmlFor="topic-picker" className="sr-only">
                  Select syllabus topic
                </Label>
                <select
                  id="topic-picker"
                  value={selectedTopicCode}
                  onChange={(event) => chooseTopic(event.target.value)}
                  className="mt-2 min-h-44 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  size={Math.min(9, Math.max(5, eligibleTopics.length))}
                >
                  {filteredByUnit.map(({ unit, topics }) =>
                    topics.length > 0 ? (
                      <optgroup key={unit} label={`Unit ${unit}`}>
                        {topics.map((topic) => (
                          <option key={topic} value={topic}>
                            {topic} ·{" "}
                            {CURRENT_SYLLABUS_TOPIC_SHORT_LABELS[topic] ??
                              CURRENT_SYLLABUS_TOPIC_LABELS[topic]}
                          </option>
                        ))}
                      </optgroup>
                    ) : null
                  )}
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {unitLabel(selectedTopicCode)} · {CURRENT_SYLLABUS_TOPIC_LABELS[selectedTopicCode as keyof typeof CURRENT_SYLLABUS_TOPIC_LABELS]}
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                disabled={generating}
                onClick={() => void generate(false)}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finding your question…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate question
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {error !== null && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-6">
            <p className="flex items-start gap-2 text-sm" role="alert">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              {error}
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void generate(false)}>
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {question !== null && (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 bg-gradient-to-br from-accent/70 to-card p-6">
              <div className="flex items-center gap-2 text-accent-foreground">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {APTLY_PRACTICE_LABEL}
                </span>
              </div>
              <p className="text-base font-medium leading-relaxed">{question.question}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>{question.topicLabel}</Badge>
                <Badge>{ASSESSMENT_SKILL_LABELS[question.skill]}</Badge>
                <Badge>{practiceFormatLabel(question)}</Badge>
                <Badge>{question.markTotal} marks</Badge>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Why this question?
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {question.why}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{NOT_OFFICIAL_IB_LABEL}</p>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/submit?practice=${question.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Start answer <ArrowRight className="h-4 w-4" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={generating}
              onClick={() => void generate(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Another question
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
