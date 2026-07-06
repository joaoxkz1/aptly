"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, CircleAlert, History, Info, Loader2, PenLine, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { FeedbackResult, type SaveState } from "@/components/feedback-result";
import { PreflightChoice, type PreflightDecision } from "@/components/submit/preflight-choice";
import { SampleWalkthrough } from "@/components/submit/sample-walkthrough";
import { ScanAttachment } from "@/components/submit/scan-attachment";
import { DiagramAttachment } from "@/components/submit/diagram-attachment";
import type { ExtractionFill } from "@/lib/scan/apply-extraction";
import type { DiagramEvidence } from "@/lib/diagram/evidence";
import { requestDiagramReview, type DiagramReviewResult } from "@/lib/diagram/review-request";
import {
  DEFAULT_TOTAL_OVERRIDE,
  MarkTotalNotice,
  type DetectedTotalOverride,
} from "@/components/submit/mark-total-notice";
import type { Assessment, AssessmentFramework, Attempt, Feedback, PracticeQuestion } from "@/lib/types";
import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS, REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import {
  runPreflight,
  MIN_MARK_TOTAL,
  MAX_MARK_TOTAL,
  type PreflightResult,
} from "@/lib/assessment/preflight";
import { resolveSubmitAction, type GradeDecision } from "@/lib/assessment/submit-flow";
import { presentedFeedback } from "@/lib/assessment/status";
import { buildLearningInsights, recurringMistakeSummary } from "@/lib/assessment/readiness";
import { revisionContextFor, type RevisionContext } from "@/lib/assessment/revisions";
import {
  APTLY_PRACTICE_LABEL,
  NOT_OFFICIAL_IB_LABEL,
  PRACTICE_FROM_FOCUS_LABEL,
  REVISION_ATTEMPT_LABEL,
} from "@/lib/assessment/display";
import { clientGradeErrorMessage, clientMessageForGradeFailure } from "@/lib/ai/grade-errors";
import {
  SAMPLE_ANSWER,
  SAMPLE_QUESTION,
  isUnmodifiedSample,
} from "@/lib/assessment/sample-walkthrough";
import { newId, useAttempts } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { fetchPracticeQuestion } from "@/lib/supabase/practice-questions";
import { cn } from "@/lib/utils";

// useSearchParams needs a Suspense boundary; the inner page is keyed on the
// params so entering/leaving revision or practice mode fully resets its state.
export default function SubmitPage() {
  return (
    <Suspense fallback={null}>
      <SubmitPageFromParams />
    </Suspense>
  );
}

function SubmitPageFromParams() {
  const params = useSearchParams();
  const reviseId = params.get("revise");
  const practiceId = params.get("practice");
  return (
    <SubmitPageInner
      key={`${reviseId ?? ""}|${practiceId ?? ""}`}
      reviseId={reviseId}
      practiceId={practiceId}
    />
  );
}

function SubmitPageInner({
  reviseId,
  practiceId,
}: {
  reviseId: string | null;
  practiceId: string | null;
}) {
  const router = useRouter();
  const { attempts, ready, addAttempt } = useAttempts();

  const [typedQuestion, setTypedQuestion] = useState("");
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
  // The framework the source step opened for (from the submit decision —
  // e.g. a revision's server-stored parent framework preference).
  const [sourceFrameworkHint, setSourceFrameworkHint] = useState<AssessmentFramework | null>(null);
  // Pre-grade choice about a detected explicit total (change it / feedback-only).
  const [totalOverride, setTotalOverride] = useState<DetectedTotalOverride>(DEFAULT_TOTAL_OVERRIDE);
  // Collapsed reference area (revision mode): original answer + feedback.
  const [showOriginal, setShowOriginal] = useState(false);
  // Aptly Scan: candidate source text read from an attached photo. It only
  // seeds the existing source-material step (still reviewed/edited there) —
  // it never bypasses the source gate and is cleared with the photo.
  const [stagedSource, setStagedSource] = useState<string | null>(null);
  // True while a scan extraction is in flight — grading pauses so the scanned
  // text is always reviewable before the grade call.
  const [scanReading, setScanReading] = useState(false);
  // Sample walkthrough (onboarding): a fixed example-feedback view for the
  // UNTOUCHED sample answer. Pure display state — opening it never grades,
  // saves, or counts anything.
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  // Diagram Evidence V1: the processed close-up diagram photo, held as
  // transient local state until grade time (nothing uploads at attach time).
  const diagramImageRef = useRef<Blob | null>(null);
  // Memoised successful review for the CURRENT photo: a grade retry after a
  // grading failure reuses it instead of paying for a second review.
  const diagramReviewRef = useRef<{ image: Blob; evidence: DiagramEvidence } | null>(null);
  // A photo was attached but its review failed — gentle notice, never blocking.
  const [diagramReviewFailed, setDiagramReviewFailed] = useState(false);

  // --- Revision mode --------------------------------------------------------
  // The original attempt being revised (from the user's own saved attempts).
  const parent = reviseId !== null ? attempts.find((a) => a.id === reviseId) ?? null : null;
  const revisionCtx: RevisionContext | null = useMemo(
    () => (parent !== null ? revisionContextFor(parent) : null),
    [parent]
  );
  const revisionMissing = reviseId !== null && ready && parent === null;

  // --- Practice mode --------------------------------------------------------
  // The Aptly-generated question being answered (RLS-scoped fetch), either
  // directly (?practice=) or because the revised original answered one.
  const practiceQuestionId = practiceId ?? revisionCtx?.practiceQuestionId ?? null;
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [practiceMissing, setPracticeMissing] = useState(false);
  useEffect(() => {
    if (practiceQuestionId === null) return;
    let active = true;
    const supabase = createClient();
    fetchPracticeQuestion(supabase, practiceQuestionId)
      .then((pq) => {
        if (!active) return;
        if (pq === null) setPracticeMissing(true);
        else setPracticeQuestion(pq);
      })
      .catch(() => {
        if (active) setPracticeMissing(true);
      });
    return () => {
      active = false;
    };
  }, [practiceQuestionId]);

  // The question being answered. Fixed (read-only) in revision and practice
  // modes so the trusted context always matches what gets graded and saved.
  const isPractice = practiceId !== null;
  const isRevision = parent !== null;
  const fixedQuestion = isRevision
    ? parent.question
    : isPractice
      ? practiceQuestion?.question ?? ""
      : null;
  const question = fixedQuestion ?? typedQuestion;

  // Live, deterministic detection so the student SEES the total Aptly found
  // (and where) before grading — normal mode only (revision preserves the
  // original's trusted context; practice totals are fixed server-side).
  const livePreflight = useMemo(
    () =>
      fixedQuestion === null && typedQuestion.trim() !== ""
        ? runPreflight(typedQuestion.trim())
        : null,
    [fixedQuestion, typedQuestion]
  );

  // Meaningful next focus → a quiet "Practice this focus" action on feedback.
  const nextFocus = useMemo(() => buildLearningInsights(attempts).nextFocus, [attempts]);

  // Guards against concurrent grading calls and duplicate saves.
  const inFlight = useRef(false);
  const persistingRef = useRef(false);
  const savedIdRef = useRef<string | null>(null);

  // Aptly Scan reads the LATEST field values when its response arrives (the
  // student may keep typing while the image is read) — a ref avoids handing
  // the in-flight request a stale snapshot.
  const scanFieldsRef = useRef({ question: "", answer: "", stagedSource: null as string | null });
  scanFieldsRef.current = {
    question: fixedQuestion === null ? typedQuestion : "",
    answer,
    stagedSource,
  };
  const getScanFields = useCallback(() => scanFieldsRef.current, []);

  // Attaching, replacing, or removing the diagram photo. A changed photo
  // invalidates any memoised review — exactly one photo is ever active.
  const handleDiagramChange = useCallback((image: Blob | null) => {
    diagramImageRef.current = image;
    diagramReviewRef.current = null;
    setDiagramReviewFailed(false);
  }, []);

  // One review per photo: reuse the memoised result when the same processed
  // photo is graded again (e.g. retry after a grading failure); only a
  // successful review is memoised, so "try again" paths stay honest.
  async function reviewDiagramOnce(
    image: Blob,
    q: string,
    a: string
  ): Promise<DiagramReviewResult> {
    const memo = diagramReviewRef.current;
    if (memo !== null && memo.image === image) {
      return { evidence: memo.evidence, failureMessage: null };
    }
    const result = await requestDiagramReview(image, q, a);
    if (result.evidence !== null) {
      diagramReviewRef.current = { image, evidence: result.evidence };
    }
    return result;
  }

  // Apply an extraction fill: ONLY empty fields change (computed in
  // lib/scan/apply-extraction.ts). Filling the question invalidates pending
  // preflight state exactly like manual typing does.
  function handleScanFill(fill: ExtractionFill) {
    if (fill.question !== null) {
      setTypedQuestion(fill.question);
      setPreflight(null);
      setSourceStep(false);
      setSourceFrameworkHint(null);
      setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    }
    if (fill.answer !== null) setAnswer(fill.answer);
    if (fill.stagedSource !== null) setStagedSource(fill.stagedSource);
  }

  function fillSample() {
    if (
      (typedQuestion.trim() !== "" || answer.trim() !== "") &&
      !window.confirm("Replace your current question and answer with the sample?")
    ) {
      return;
    }
    setTypedQuestion(SAMPLE_QUESTION);
    setAnswer(SAMPLE_ANSWER);
    // Replacing the question invalidates any pending choice/override for it.
    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
  }

  // The sample paths exist ONLY while both fields hold the untouched sample
  // text (manual flow only). Any edit makes this false and the page behaves
  // exactly like a normal submission — no hidden free-sample treatment.
  const isSample = fixedQuestion === null && isUnmodifiedSample(typedQuestion, answer);

  // "Try your own answer" from the walkthrough: back to an empty form.
  function handleTryYourOwn() {
    setShowWalkthrough(false);
    setTypedQuestion("");
    setAnswer("");
    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    setStagedSource(null);
    handleDiagramChange(null);
  }

  // Saves exactly once per successful grading result; safe against rerenders,
  // retries, and repeated clicks. Never shows a false "saved" state. On
  // success the result takes its DATABASE id so follow-up actions (Revise
  // this answer) link to the real row.
  async function persist(attempt: Attempt) {
    if (savedIdRef.current === attempt.id || persistingRef.current) return;
    persistingRef.current = true;
    setSaveState("saving");
    try {
      const saved = await addAttempt(attempt);
      savedIdRef.current = saved.id;
      setResult(saved);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      persistingRef.current = false;
    }
  }

  // Step 1: ONE pure, unit-tested decision (lib/assessment/submit-flow.ts)
  // resolves what a "Grade my answer" click does: grade now, open the source
  // step, open the compact chooser, or flag an invalid typed total. A
  // source-dependent revision with no stored source ALWAYS opens the source
  // step first — the paid grading call can never run before that choice.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || grading) return;
    // A scan is still being read: grading waits so the student always reviews
    // the extracted text before the grade call.
    if (scanReading) return;

    const q = question.trim();
    const a = answer.trim();
    if (q === "" || a === "") return;
    if (q.length > MAX_QUESTION_CHARS || a.length > MAX_ANSWER_CHARS) {
      setError("Your question or answer is too long. Please shorten it and try again.");
      return;
    }

    setError(null);

    const action = resolveSubmitAction({
      question: q,
      practiceLinked: practiceQuestionId !== null,
      revisionCtx,
      totalOverride,
    });

    if (action.kind === "invalid_custom_total") {
      setError(
        `Enter a mark total between ${MIN_MARK_TOTAL} and ${MAX_MARK_TOTAL}, or use the detected total.`
      );
      return;
    }
    if (action.kind === "grade") {
      void grade(action.decision);
      return;
    }
    // "source_step" | "choice": the student decides before any grading call.
    // The entered answer is untouched — only the choice UI opens.
    setSourceStep(action.kind === "source_step");
    setSourceFrameworkHint(action.kind === "source_step" ? action.sourceFramework : null);
    setPreflight(action.preflight);
  }

  // Step 2: grade with the resolved preflight decision. The server re-checks the
  // policy — this decision is an input, never the final authority. For generated
  // practice the server swaps in ITS stored question/source before grading and
  // ignores every preflight field (requestedSource stays null).
  async function grade(decision: PreflightDecision | GradeDecision) {
    if (inFlight.current || grading) return;

    const q = question.trim();
    const a = answer.trim();
    if (q === "" || a === "") return;

    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setError(null);
    setGrading(true);
    inFlight.current = true;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS + 5000);

    // Diagram Evidence V1: review the attached photo in PARALLEL with grading.
    // Two separate routes — grading stays text-only and never sees the photo;
    // the review (which never throws) is awaited only AFTER grading succeeds,
    // so a slow or failed review can never block or change written feedback.
    const diagramImage = diagramImageRef.current;
    const diagramReview = diagramImage !== null ? reviewDiagramOnce(diagramImage, q, a) : null;

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
          practiceQuestionId,
          // Revisions: lets the server retrieve the parent's privately
          // retained source itself instead of trusting client source text.
          parentAttemptId: revisionCtx?.parentId ?? null,
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
      // Manual source retention: keep the attempt's own private copy of the
      // source it was actually graded against (the parent's retained source
      // for revisions, else the pasted source) — but ONLY when the server
      // confirmed usable source, and never for generated practice (its source
      // stays solely in practice_questions).
      const usedSource = revisionCtx?.storedSource ?? decision.sourceMaterial ?? null;
      const retainedSource =
        practiceQuestionId == null && assessment?.sourceMaterialProvided === true
          ? usedSource
          : null;
      // The parallel diagram review (if any). Evidence attaches to THIS
      // attempt only; a failed review resolves to null with a gentle notice.
      let diagramEvidence: DiagramEvidence | null = null;
      if (diagramReview !== null) {
        const review = await diagramReview;
        diagramEvidence = review.evidence;
        setDiagramReviewFailed(review.evidence === null);
      } else {
        setDiagramReviewFailed(false);
      }
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
        // Durable Practice Loop links (RLS verifies both belong to this user).
        parentAttemptId: revisionCtx?.parentId ?? null,
        practiceQuestionId,
        sourceMaterial: retainedSource,
        // Diagram Evidence V1: structured feedback-only findings (never marks,
        // never image data). Strictly this attempt's own — revisions re-attach.
        diagramEvidence,
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
    if (reviseId !== null || practiceId !== null) {
      // Leave revision/practice mode; the key on the inner page resets state.
      router.push("/submit");
      return;
    }
    setResult(null);
    setSaveState("idle");
    savedIdRef.current = null;
    setTypedQuestion("");
    setAnswer("");
    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    setStagedSource(null);
    handleDiagramChange(null);
  }

  // Sample walkthrough: a fixed example — nothing is graded, saved, or counted.
  if (showWalkthrough) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sample feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            An example of the feedback Aptly gives, for the sample Economics answer.
          </p>
        </div>
        <SampleWalkthrough
          onTryYourOwn={handleTryYourOwn}
          onBack={() => setShowWalkthrough(false)}
        />
      </div>
    );
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
          parentAttempt={parent}
          nextFocus={nextFocus}
          diagramReviewFailed={diagramReviewFailed}
          onRevise={
            saveState === "saved" && savedIdRef.current !== null
              ? () => router.push(`/submit?revise=${savedIdRef.current}`)
              : undefined
          }
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

  const heading = isRevision
    ? "Revise this answer"
    : isPractice
      ? "Answer your practice question"
      : "Submit an answer";
  const subheading = isRevision
    ? "Write a fresh answer to the same question. Aptly grades it like any attempt and links it to the original."
    : isPractice
      ? "This question was generated from your next focus. Write your answer below."
      : "Paste your Economics question and answer. Aptly will identify the format and give you an evidence-aware estimate.";

  // Revision/practice context still loading (attempts or practice fetch).
  const contextLoading =
    (reviseId !== null && !ready) ||
    (practiceQuestionId !== null && practiceQuestion === null && !practiceMissing);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
      </div>

      {/* Honest fallbacks when a linked context cannot be loaded. */}
      {(revisionMissing || practiceMissing) && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {revisionMissing
              ? "The original attempt could not be found — it may have been deleted. You can still submit a fresh answer below."
              : "This practice question could not be found — it may have been removed. Generate a new one from your next focus."}
          </span>
        </div>
      )}

      {/* Revision context: concise banner + collapsed reference (never dominant). */}
      {isRevision && revisionCtx !== null && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-accent/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
            {REVISION_ATTEMPT_LABEL}
          </p>
          <p className="text-sm text-muted-foreground">
            You&apos;re revising the same question after feedback. Your previous answer stays in
            your learning log — start this one fresh.
          </p>
          {revisionCtx.needsSourceAgain && (
            <p className="text-sm text-muted-foreground">
              Paste the source text or data again to receive a source-based estimate. Without it,
              this revision is graded feedback-only.
            </p>
          )}
          {revisionCtx.storedSource !== null && (
            <p className="text-sm text-muted-foreground">
              Original source material will be used for this revision.
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-expanded={showOriginal}
            >
              {showOriginal ? "Hide" : "Show"} original answer and feedback
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showOriginal && "rotate-180")}
              />
            </button>
            {showOriginal && parent !== null && (
              <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                {/* Read-only inspection of the retained source — it cannot be
                    edited here: a revision compares work on the same context. */}
                {revisionCtx.storedSource !== null && (
                  <div>
                    <p className="font-semibold uppercase tracking-wider">
                      Original source material
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{revisionCtx.storedSource}</p>
                  </div>
                )}
                <div>
                  <p className="font-semibold uppercase tracking-wider">Original answer</p>
                  <p className="mt-1 whitespace-pre-wrap">{parent.answer}</p>
                </div>
                {presentedFeedback(parent).improvements.length > 0 && (
                  <div>
                    <p className="font-semibold uppercase tracking-wider">Previous improvements</p>
                    <ul className="mt-1 list-disc pl-4">
                      {presentedFeedback(parent).improvements.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {presentedFeedback(parent).examinerComment !== "" && (
                  <div>
                    <p className="font-semibold uppercase tracking-wider">Previous comment</p>
                    <p className="mt-1 italic">{presentedFeedback(parent).examinerComment}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Practice context: what this generated question practises, honestly labelled. */}
      {isPractice && practiceQuestion !== null && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-primary/25 bg-accent/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
            {APTLY_PRACTICE_LABEL}
          </p>
          <p className="text-sm text-muted-foreground">
            {PRACTICE_FROM_FOCUS_LABEL}: {practiceQuestion.topicLabel} · {practiceQuestion.markTotal}{" "}
            marks. {NOT_OFFICIAL_IB_LABEL}.
          </p>
        </div>
      )}

      {/* One purpose statement (the header above) — the card adds no repeated
          instructions; contextual help appears only when detection needs it. */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <Label htmlFor="question">Question</Label>
              {fixedQuestion !== null ? (
                // Revision/practice: the question is fixed so the trusted
                // context (total, framework, stored source) stays valid.
                <div
                  id="question"
                  className="mt-1 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed"
                >
                  {contextLoading ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading question…
                    </span>
                  ) : (
                    question
                  )}
                </div>
              ) : (
                <>
                  <Textarea
                    id="question"
                    required
                    maxLength={MAX_QUESTION_CHARS}
                    value={typedQuestion}
                    onChange={(e) => {
                      setTypedQuestion(e.target.value);
                      setPreflight(null); // editing invalidates a pending preflight choice
                      setSourceStep(false);
                      setSourceFrameworkHint(null);
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
                </>
              )}
            </div>

            {/* Aptly-generated source material: displayed for reading, never
                re-pasted — grading reads the stored server-side copy. */}
            {practiceQuestion !== null && practiceQuestion.sourceMaterial !== null && (
              <div>
                <Label htmlFor="practice-source">Source material</Label>
                <div
                  id="practice-source"
                  className="mt-1 whitespace-pre-wrap rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground"
                >
                  {practiceQuestion.sourceMaterial}
                </div>
              </div>
            )}

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

            {/* Aptly Scan: one understated attachment control — manual flow
                only (revision/practice questions are fixed or server-owned,
                so an attachment would have no honest function there). */}
            {fixedQuestion === null && (
              <ScanAttachment
                disabled={grading || preflight !== null}
                getFields={getScanFields}
                onFill={handleScanFill}
                onRemoved={() => setStagedSource(null)}
                onReadingChange={setScanReading}
              />
            )}

            {/* Diagram Evidence V1: one optional close-up diagram photo,
                reviewed separately at grade time — feedback only, never
                marks. Available in every mode: revising a diagram-explain
                answer is exactly when a student wants their diagram seen. */}
            <DiagramAttachment
              disabled={grading || preflight !== null}
              onAttachedChange={handleDiagramChange}
            />


            {/* Untouched sample: two calm paths — the free fixed walkthrough,
                or edit the text and grade it as a real answer. Opening the
                walkthrough is pure display state (no request, no save). */}
            {isSample && preflight === null && !grading && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-primary/25 bg-accent/40 p-4">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
                  <div>
                    <p className="text-sm font-semibold">This is Aptly&apos;s sample answer</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      View the example feedback walkthrough — nothing is graded or saved — or edit
                      the question or answer and grade it as your own work.
                    </p>
                  </div>
                </div>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      // The form (and the attachment control) unmounts while
                      // the walkthrough shows — drop any attached diagram so
                      // no invisible photo survives into a later grade.
                      handleDiagramChange(null);
                      setShowWalkthrough(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    View sample feedback
                  </Button>
                </div>
              </div>
            )}

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
                // From the submit decision: the framework the source step opened
                // for (e.g. a revision's stored parent framework preference).
                initialSourceFramework={sourceFrameworkHint}
                // Candidate source read from an attached photo — it only seeds
                // the editable source box; the student still reviews it here.
                initialSource={stagedSource}
                onChoose={(d) => void grade(d)}
                onEnterSourceStep={() => setSourceStep(true)}
              />
            )}

            {/* Hide the generic Grade CTA while the source step is active so the
                only grade action is "Grade with this source". */}
            {!sourceStep && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="lg" disabled={grading || contextLoading || scanReading}>
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
                  {fixedQuestion === null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={fillSample}
                      disabled={grading}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Use a sample answer
                    </Button>
                  )}
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

      {practiceMissing && (
        <Link
          href="/practice"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <PenLine className="h-4 w-4" />
          Generate a new practice question
        </Link>
      )}

      <p className="text-xs text-muted-foreground">
        Aptly provides practice estimates, not official IB grades.
      </p>
    </div>
  );
}
