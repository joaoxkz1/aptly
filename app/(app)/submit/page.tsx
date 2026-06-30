"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, History, Loader2, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { FeedbackResult, type SaveState } from "@/components/feedback-result";
import type { Assessment, Attempt, Feedback } from "@/lib/types";
import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS, REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import { newId, useAttempts } from "@/lib/storage";

const SAMPLE = {
  question:
    "Discuss whether a subsidy is the best policy to correct the under-consumption of vaccines.",
  answer:
    "Vaccines create positive externalities of consumption: the social benefit is higher than the private benefit, so the free market under-provides them. A subsidy shifts the supply curve right on the diagram, lowering price and raising quantity towards the social optimum. For example, many EU countries subsidise flu vaccines for the elderly. However, subsidies have an opportunity cost and their effect depends on the price elasticity of demand — if hesitancy, not price, causes under-consumption, education campaigns may work better. Overall, a subsidy is effective when price is the main barrier, but it should be combined with information provision.",
};

export default function SubmitPage() {
  const { addAttempt } = useAttempts();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Guards against concurrent grading calls and duplicate saves.
  const inFlight = useRef(false);
  const persistingRef = useRef(false);
  const savedIdRef = useRef<string | null>(null);

  function fillSample() {
    if (
      (question.trim() !== "" || answer.trim() !== "") &&
      !window.confirm("Replace your current question and answer with the sample?")
    ) {
      return;
    }
    setQuestion(SAMPLE.question);
    setAnswer(SAMPLE.answer);
  }

  function messageForStatus(status: number, code: string): string {
    if (status === 401) return "Your session expired. Please sign in again.";
    if (code === "too_long")
      return "Your question or answer is too long. Please shorten it and try again.";
    return "Sorry — grading failed. Please try again in a moment.";
  }

  // Saves exactly once per successful grading result; safe against rerenders,
  // retries, and repeated clicks. Never shows a false "saved" state.
  async function persist(attempt: Attempt) {
    if (savedIdRef.current === attempt.id || persistingRef.current) return;
    persistingRef.current = true;
    setSaveState("saving");
    try {
      await addAttempt(attempt);
      savedIdRef.current = attempt.id;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      persistingRef.current = false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || grading) return;

    const q = question.trim();
    const a = answer.trim();
    if (q === "" || a === "") return;
    if (q.length > MAX_QUESTION_CHARS || a.length > MAX_ANSWER_CHARS) {
      setError("Your question or answer is too long. Please shorten it and try again.");
      return;
    }

    setError(null);
    setGrading(true);
    inFlight.current = true;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS + 5000);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Economics-only; the question type and topic are detected automatically.
        body: JSON.stringify({ subject: "Economics", topic: "Economics", question: q, answer: a }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let code = "grading_failed";
        try {
          const body = (await res.json()) as { error?: string };
          if (typeof body.error === "string") code = body.error;
        } catch {
          // ignore parse failure; use default code
        }
        setError(messageForStatus(res.status, code)); // fail closed: no result, nothing saved
        return;
      }

      const { feedback, assessment } = (await res.json()) as {
        feedback: Feedback;
        assessment?: Assessment | null;
      };
      const attempt: Attempt = {
        id: newId(),
        createdAt: new Date().toISOString(),
        subject: "Economics",
        // Stored topic comes from automatic detection, not a manual selector.
        topic: assessment?.topicLabel?.trim() || "Economics",
        question: q,
        answer: a,
        feedback,
        assessment: assessment ?? null,
      };
      setResult(attempt);
      setSaveState("idle");
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Automatically save the successful grade to the signed-in account.
      void persist(attempt);
    } catch {
      setError("Sorry — grading failed. Please try again in a moment.");
    } finally {
      setGrading(false);
      inFlight.current = false;
      window.clearTimeout(timer);
    }
  }

  function handleRetry() {
    if (result !== null) void persist(result);
  }

  function handleTryAnother() {
    setResult(null);
    setSaveState("idle");
    savedIdRef.current = null;
    setQuestion("");
    setAnswer("");
  }

  if (result !== null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aptly&apos;s estimated feedback on your Economics answer.
          </p>
        </div>
        <FeedbackResult
          attempt={result}
          saveState={saveState}
          onRetry={handleRetry}
          onTryAnother={handleTryAnother}
        />
        {saveState === "saved" && (
          <Link
            href="/attempts"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <History className="h-4 w-4" />
            View it in your learning log
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submit an answer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste an IB Economics question and your answer — Aptly detects the question type and
          estimates the mark.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your answer</CardTitle>
          <CardDescription>No setup needed — just the question and your response.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                required
                maxLength={MAX_QUESTION_CHARS}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Evaluate the use of indirect taxes to correct market failure. [15 marks]"
                className="min-h-20"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="answer">Your answer</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {answer.trim() === "" ? 0 : answer.trim().split(/\s+/).length} words
                </span>
              </div>
              <Textarea
                id="answer"
                required
                maxLength={MAX_ANSWER_CHARS}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Write your full answer here. Tip: define key terms, use a real-world example, and end with an evaluation."
                className="min-h-52"
              />
            </div>

            {error !== null && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={grading}>
                {grading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking your answer…
                  </>
                ) : (
                  "Grade my answer"
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={fillSample} disabled={grading}>
                <Wand2 className="h-4 w-4" />
                Fill with a sample answer
              </Button>
            </div>

            {grading && (
              <p className="text-xs text-muted-foreground">
                Aptly is detecting the question type, checking the assessment skills, and building
                your feedback.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Estimated AI study feedback for practice, not an official IB grade.
      </p>
    </div>
  );
}
