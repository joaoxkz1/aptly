"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, History, Loader2, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { FeedbackResult, type SaveState } from "@/components/feedback-result";
import { PreflightChoice, type PreflightDecision } from "@/components/submit/preflight-choice";
import {
  DEFAULT_TOTAL_OVERRIDE,
  MarkTotalNotice,
  type DetectedTotalOverride,
} from "@/components/submit/mark-total-notice";
import type { Assessment, Attempt, Feedback } from "@/lib/types";
import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS, REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import {
  isValidMarkTotal,
  runPreflight,
  MIN_MARK_TOTAL,
  MAX_MARK_TOTAL,
  type PreflightResult,
} from "@/lib/assessment/preflight";
import { requiresSourceMaterial } from "@/lib/assessment/status";
import { recurringMistakeSummary } from "@/lib/assessment/readiness";
import { clientGradeErrorMessage, clientMessageForGradeFailure } from "@/lib/ai/grade-errors";
import { newId, useAttempts } from "@/lib/storage";

const SAMPLE = {
  question:
    "Discuss whether a subsidy is the best policy to correct the under-consumption of vaccines.",
  answer:
    "Vaccines create positive externalities of consumption: the social benefit is higher than the private benefit, so the free market under-provides them. A subsidy shifts the supply curve right on the diagram, lowering price and raising quantity towards the social optimum. For example, many EU countries subsidise flu vaccines for the elderly. However, subsidies have an opportunity cost and their effect depends on the price elasticity of demand — if hesitancy, not price, causes under-consumption, education campaigns may work better. Overall, a subsidy is effective when price is the main barrier, but it should be combined with information provision.",
};

export default function SubmitPage() {
  const { attempts, addAttempt } = useAttempts();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Non-null when a compact preflight choice is needed before grading.
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  // True while the Paper 2(g)/3(b) source-material step is active — the bottom
  // "Grade my answer" CTA is hidden so the source-aware action is the only grade.
  const [sourceStep, setSourceStep] = useState(false);
  // Pre-grade choice about a detected explicit total (change it / feedback-only).
  const [totalOverride, setTotalOverride] = useState<DetectedTotalOverride>(DEFAULT_TOTAL_OVERRIDE);

  // Live, deterministic detection so the student SEES the total Aptly found
  // (and where) before grading — no silent first-regex-hit denominators.
  const livePreflight = useMemo(
    () => (question.trim() === "" ? null : runPreflight(question.trim())),
    [question]
  );

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
    // Replacing the question invalidates any pending choice/override for it.
    setPreflight(null);
    setSourceStep(false);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
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

  // Step 1: validate and run the deterministic preflight. A single explicit
  // total (already shown to the student in the detection notice) grades
  // immediately unless they overrode it; multiple distinct totals or a missing
  // total surface the compact choice.
  function handleSubmit(e: React.FormEvent) {
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
    const pf = runPreflight(q);

    if (pf.kind === "explicit") {
      // The student's visible pre-grade override of the detected total.
      if (totalOverride.mode === "feedback_only") {
        void grade({
          requestedSource: "feedback_only",
          requestedTotal: null,
          templateId: null,
          requestedFramework: null,
          sourceMaterial: null,
        });
        return;
      }
      if (totalOverride.mode === "custom") {
        const parsed = Number.parseInt(totalOverride.total, 10);
        if (!isValidMarkTotal(parsed)) {
          setError(
            `Enter a mark total between ${MIN_MARK_TOTAL} and ${MAX_MARK_TOTAL}, or use the detected total.`
          );
          return;
        }
        void grade({
          requestedSource: "user_confirmed",
          requestedTotal: parsed,
          templateId: pf.templateId,
          requestedFramework: null,
          sourceMaterial: null,
        });
        return;
      }
      // Grade immediately only when the total AND the marking framework are both
      // safe to use. An ambiguous 10/15 total needs a compact framework choice; a
      // Paper 2(g)/3(b) framework needs its source text/data first.
      if (pf.frameworkConfirmed && !requiresSourceMaterial(pf.framework)) {
        void grade({
          requestedSource: "explicit",
          requestedTotal: pf.total,
          templateId: pf.templateId,
          requestedFramework: null,
          sourceMaterial: null,
        });
        return;
      }
    }

    // Multiple distinct totals, an unconfirmed framework, a source-dependent
    // framework, or no total at all → the compact choice decides before grading.
    // An explicit Paper 2(g)/3(b) opens straight into the source step.
    setSourceStep(
      pf.kind === "explicit" && pf.frameworkConfirmed && requiresSourceMaterial(pf.framework)
    );
    setPreflight(pf);
  }

  // Step 2: grade with the resolved preflight decision. The server re-checks the
  // policy — this decision is an input, never the final authority.
  async function grade(decision: PreflightDecision) {
    if (inFlight.current || grading) return;

    const q = question.trim();
    const a = answer.trim();
    if (q === "" || a === "") return;

    setPreflight(null);
    setSourceStep(false);
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
        body: JSON.stringify({
          subject: "Economics",
          topic: "Economics",
          question: q,
          answer: a,
          requestedSource: decision.requestedSource,
          requestedTotal: decision.requestedTotal,
          templateId: decision.templateId,
          requestedFramework: decision.requestedFramework,
          sourceMaterial: decision.sourceMaterial,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let code = "grading_failed";
        let reference: string | null = null;
        try {
          const body = (await res.json()) as { error?: string; reference?: string };
          if (typeof body.error === "string") code = body.error;
          if (typeof body.reference === "string") reference = body.reference;
        } catch {
          // ignore parse failure; use default code
        }
        // Fail closed: no result, nothing saved.
        setError(clientMessageForGradeFailure(res.status, code, reference));
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
      setError(clientGradeErrorMessage());
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
    setPreflight(null);
    setSourceStep(false);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
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
          recurring={recurringMistakeSummary(attempts)}
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
          Paste your Economics question and answer. Aptly will identify the format and give you an
          evidence-aware estimate.
        </p>
      </div>

      {/* One purpose statement (the header above) — the card adds no repeated
          instructions; contextual help appears only when detection needs it. */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                required
                maxLength={MAX_QUESTION_CHARS}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setPreflight(null); // editing invalidates a pending preflight choice
                  setSourceStep(false);
                  setTotalOverride(DEFAULT_TOTAL_OVERRIDE); // and any total override
                }}
                placeholder="Paste the full question, including any mark total or source text reference."
                className="min-h-20"
              />
              {/* Visible pre-grade detection: the total Aptly found (and where),
                  with a small way to change it or choose feedback-only — no
                  silent denominators, no forced extra click. */}
              {livePreflight !== null && preflight === null && !grading && (
                <div className="mt-2">
                  <MarkTotalNotice
                    preflight={livePreflight}
                    override={totalOverride}
                    onOverrideChange={setTotalOverride}
                    disabled={grading}
                  />
                </div>
              )}
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
                placeholder="Write your answer here."
                className="min-h-52"
              />
            </div>

            {error !== null && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {preflight !== null && !grading && (
              <PreflightChoice
                preflight={preflight}
                disabled={grading}
                onChoose={(d) => void grade(d)}
                onEnterSourceStep={() => setSourceStep(true)}
              />
            )}

            {/* Hide the generic Grade CTA while the source step is active so the
                only grade action is "Grade with this source". */}
            {!sourceStep && (
              <div className="flex flex-col gap-2">
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
                  {/* Quiet secondary affordance — not another instruction block. */}
                  <Button type="button" variant="ghost" size="sm" onClick={fillSample} disabled={grading}>
                    <Wand2 className="h-3.5 w-3.5" />
                    Use a sample answer
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your response is sent to OpenAI for feedback and stored privately in Aptly. Avoid
                  including personal information.
                </p>
              </div>
            )}

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
        Aptly provides practice estimates, not official IB grades.
      </p>
    </div>
  );
}
