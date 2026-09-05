"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
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
import { cn } from "@/lib/utils";
import { focusMatchesSettings, focusPolicy, focusSummary, savedPracticeFocus, type PracticeFocus } from "@/lib/assessment/focused-practice";

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
      <PracticeRoute />
    </Suspense>
  );
}
function PracticeRoute() {
  const params = useSearchParams();
  return <PracticeGenerator key={params.toString()} />;
}

function PracticeGenerator() {
  const params = useSearchParams();
  const requestedTopic = validTopic(params.get("topic"));
  const requestedMark = validMark(params.get("marks"));
  const requestedSource = params.get("source") ?? (params.get("focus") === "1" ? "current_focus" : null);
  const sourceAttemptId = params.get("attempt");

  const [courseLevel, setCourseLevel] = useState<EconomicsCourseLevel | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingCourse, setEditingCourse] = useState(false);
  const [marks, setMarks] = useState<PracticeMarkTotal>(requestedMark ?? 10);
  const [topicCode, setTopicCode] = useState(requestedTopic ?? "1.1");
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<PracticeFocus | null>(null);
  const [focusBlocked, setFocusBlocked] = useState(false);
  const [exitedFocus, setExitedFocus] = useState(params.get("mode") === "general");
  const selectionVersion = useRef(0);
  const canGenerateFocus = !focusBlocked && (!focus || focusPolicy(focus.targetSkill) !== null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (requestedMark === null) {
        const remembered = validMark(window.sessionStorage.getItem(LAST_MARKS_KEY));
        if (remembered !== null) setMarks(remembered);
      }
      setCourseLevel(readEconomicsCourseLevel(data.session?.user.user_metadata));
      if (requestedSource) {
        try {
          const query = new URLSearchParams({ source: requestedSource });
          if (sourceAttemptId) query.set("attempt", sourceAttemptId);
          const res = await fetch(`/api/practice/focus?${query}`, { cache: "no-store" });
          const body = await res.json();
          if (!active) return;
          if (!res.ok || !body.focus?.serverVerified) {
            setFocusBlocked(true);
            setError(clientMessageForPracticeFailure(res.status, body.error));
          } else {
            const verified = body.focus as PracticeFocus;
            setFocus(verified);
            setTopicCode(verified.topicCode);
            if (verified.recommendedMarks !== null) setMarks(verified.recommendedMarks);
          }
        } catch {
          if (!active) return;
          setFocusBlocked(true);
          setError("Couldn't load this focus. Reload to try again, or choose general practice.");
        }
      }
      if (!active) return;
      setProfileLoading(false);
    });
    return () => {
      active = false;
      selectionVersion.current += 1;
    };
  }, [requestedMark, requestedSource, sourceAttemptId]);

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
      if (courseLevel === null || generating || profileLoading || !canGenerateFocus) return;
      const version = selectionVersion.current;
      setGenerating(true);
      setError(null);
      if (regenerate) setQuestion(null);
      try {
        const outcome = await generationClient.request({
          marks,
          topicCode: selectedTopicCode,
          context: focus?.source ?? "general",
          sourceAttemptId: focus?.sourceAttemptId,
          regenerate,
        });
        if (version !== selectionVersion.current) return;
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
        if (version === selectionVersion.current) setError(clientMessageForPracticeFailure(502, focus ? "focused_generation_failed" : "practice_generation_failed"));
      } finally {
        setGenerating(false);
      }
    },
    [courseLevel, focus, generating, marks, selectedTopicCode, profileLoading, canGenerateFocus]
  );

  function chooseMarks(value: PracticeMarkTotal) {
    selectionVersion.current += 1;
    if (focus && !focusMatchesSettings(focus, selectedTopicCode, value)) exitFocus(selectedTopicCode, value);
    setMarks(value);
    setQuestion(null);
    setError(null);
    window.sessionStorage.setItem(LAST_MARKS_KEY, String(value));
  }

  function chooseTopic(value: string) {
    selectionVersion.current += 1;
    if (focus && !focusMatchesSettings(focus, value, marks)) exitFocus(value, marks);
    setTopicCode(value);
    setQuestion(null);
    setError(null);
  }
  function exitFocus(nextTopic = selectedTopicCode, nextMarks = marks) {
    selectionVersion.current += 1;
    setFocus(null);
    setFocusBlocked(false);
    setExitedFocus(true);
    setQuestion(null);
    setError(null);
    // Refresh/back/copied URLs must describe the same general configuration.
    const query = new URLSearchParams({ topic: nextTopic, marks: String(nextMarks), mode: "general" });
    window.history.replaceState(null, "", `/practice?${query}`);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
            Create a practice question
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a topic and mark total. Aptly will shape the question for you.
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
                exitFocus();
                setCourseLevel(level);
                setEditingCourse(false);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {focus && (
            <div className="rounded-xl border border-primary/20 bg-accent/55 px-4 py-3 text-sm text-accent-foreground">
              <p className="font-semibold">{focusSummary(focus)}</p>
              <p className="mt-1 text-xs">{focus.source === "answer_feedback" ? "From this answer’s feedback." : "From your current focus."} {focusPolicy(focus.targetSkill)?.reasoning}</p>
              {!canGenerateFocus && <p className="mt-1">This exact focused-practice type isn’t available yet.</p>}
            </div>
          )}
          {exitedFocus && <p className="text-sm text-muted-foreground" role="status">General practice — choose a topic and question length.</p>}
          {!canGenerateFocus && <Button variant="outline" onClick={() => exitFocus()}>Practise this topic instead</Button>}

          <Card className="overflow-hidden">
            <CardContent className="flex flex-col gap-6 p-6 md:p-7">
              <fieldset>
                <legend className="text-sm font-semibold">Question length</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRACTICE_MARK_TOTALS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={marks === value ? "primary" : "outline"}
                      aria-pressed={marks === value}
                      onClick={() => chooseMarks(value)}
                      className="min-w-20"
                    >
                      {value} marks
                    </Button>
                  ))}
                </div>
              </fieldset>

              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <Label htmlFor="topic-search" className="mb-0">Topic</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">Choose one syllabus area to practise.</p>
                  </div>
                  <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                    {eligibleTopics.length} topics
                  </span>
                </div>
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
                <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background/55">
                  <div
                    role="listbox"
                    aria-label="Select syllabus topic"
                    className="aptly-scrollbar max-h-72 overflow-y-auto p-1.5"
                  >
                    {filteredByUnit.map(({ unit, topics }) =>
                      topics.length > 0 ? (
                        <div key={unit} className="not-first:mt-2">
                          <p className="sticky top-0 z-10 bg-background/95 px-2.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                            Unit {unit}
                          </p>
                          <div className="flex flex-col gap-1">
                            {topics.map((topic) => {
                              const selected = topic === selectedTopicCode;
                              return (
                                <button
                                  key={topic}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => chooseTopic(topic)}
                                  className={cn(
                                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                                    selected
                                      ? "bg-accent font-semibold text-accent-foreground"
                                      : "text-foreground hover:bg-muted"
                                  )}
                                >
                                  <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                                    {topic}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    {CURRENT_SYLLABUS_TOPIC_SHORT_LABELS[topic] ??
                                      CURRENT_SYLLABUS_TOPIC_LABELS[topic]}
                                  </span>
                                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null
                    )}
                    {filteredByUnit.every(({ topics }) => topics.length === 0) && (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No topics match “{search.trim()}”.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-accent/55 px-3.5 py-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-accent-foreground">Selected topic</p>
                    <p className="mt-0.5 text-sm font-medium">
                      {unitLabel(selectedTopicCode)} · {CURRENT_SYLLABUS_TOPIC_LABELS[selectedTopicCode as keyof typeof CURRENT_SYLLABUS_TOPIC_LABELS]}
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto sm:self-start"
                disabled={generating || !canGenerateFocus}
                onClick={() => void generate(false)}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing your question…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate question
                  </>
                )}
              </Button>
              {generating && <p className="text-xs text-muted-foreground" role="status">Finding a matching question or creating a fresh one. This may take a moment.</p>}
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
              <Button variant="outline" size="sm" disabled={!canGenerateFocus} onClick={() => void generate(false)}>
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
              {savedPracticeFocus(question) && <p className="text-sm font-semibold">{focusSummary(savedPracticeFocus(question)!)}</p>}
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
