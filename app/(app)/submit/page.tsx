"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, CircleAlert, History, Info, Loader2, PenLine, Sparkles, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AttemptsLoadNotice } from "@/components/attempts-load-notice";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { FeedbackResult, type SaveState } from "@/components/feedback-result";
import { focusSummary, savedPracticeFocus } from "@/lib/assessment/focused-practice";
import { PreflightChoice, type PreflightDecision } from "@/components/submit/preflight-choice";
import { SampleWalkthrough } from "@/components/submit/sample-walkthrough";
import { ScanAttachment } from "@/components/submit/scan-attachment";
import { DiagramAttachment, type DiagramAttachStatus } from "@/components/submit/diagram-attachment";
import type { ExtractionFill } from "@/lib/scan/apply-extraction";
import type { DiagramEvidence } from "@/lib/diagram/evidence";
import { requestDiagramReview, type DiagramReviewResult } from "@/lib/diagram/review-request";
import {
  DEFAULT_TOTAL_OVERRIDE,
  MarkTotalNotice,
  type DetectedTotalOverride,
} from "@/components/submit/mark-total-notice";
import type { AssessmentFramework, Attempt, PracticeQuestion } from "@/lib/types";
import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS, REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import {
  runPreflight,
  MIN_MARK_TOTAL,
  MAX_MARK_TOTAL,
  type PreflightResult,
} from "@/lib/assessment/preflight";
import { resolveSubmitAction, type GradeDecision } from "@/lib/assessment/submit-flow";
import { presentedFeedback } from "@/lib/assessment/status";
import { recurringMistakeSummary } from "@/lib/assessment/readiness";
import { revisionContextFor, type RevisionContext } from "@/lib/assessment/revisions";
import {
  APTLY_PRACTICE_LABEL,
  REVISION_ATTEMPT_LABEL,
  practiceProvenanceLabel,
} from "@/lib/assessment/display";
import { clientGradeErrorMessage, clientMessageForGradeFailure, clientTerminalGradeFailureMessage } from "@/lib/ai/grade-errors";
import { classifyOperationOutcome } from "@/lib/ai/operation-outcome";
import {
  SAMPLE_ANSWER,
  SAMPLE_QUESTION,
  isUnmodifiedSample,
} from "@/lib/assessment/sample-walkthrough";
import { broadcastAttemptsChanged, useAttempts } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { fetchPracticeQuestion } from "@/lib/supabase/practice-questions";
import { cn } from "@/lib/utils";
import { useDraftAccount } from "@/components/draft-account-boundary";
import { useSubmitDraft } from "@/lib/drafts/use-submit-draft";
import { draftTask } from "@/lib/drafts/session-draft";
import { isUuid } from "@/lib/auth/verified-user";

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
  const accountId = useDraftAccount();
  const [revisionImage, setRevisionImage] = useState<{ accountId: string; attemptId: string; image: Blob } | null>(null);
  const reviseId = params.get("revise");
  const practiceId = params.get("practice");
  // Cold-start deep link (?sample=1): open straight into the free sample
  // walkthrough — sample-only display state, never a grade or a save. Ignored
  // in revision/practice modes, where the question is fixed.
  const startWithSample =
    params.get("sample") === "1" && reviseId === null && practiceId === null;
  if (!accountId) return <p className="text-sm text-muted-foreground">Checking your account…</p>;
  return (
    <SubmitPageInner
      key={`${reviseId ?? ""}|${practiceId ?? ""}|${startWithSample ? "s" : ""}`}
      accountId={accountId}
      reviseId={reviseId}
      practiceId={practiceId}
      startWithSample={startWithSample}
      availableRevisionImage={revisionImage?.accountId === accountId && revisionImage.attemptId === reviseId ? revisionImage.image : null}
      rememberRevisionImage={(attemptId, image) => setRevisionImage(image ? { accountId, attemptId, image } : null)}
    />
  );
}

function SubmitPageInner({
  accountId,
  reviseId,
  practiceId,
  startWithSample = false,
  availableRevisionImage = null,
  rememberRevisionImage,
}: {
  accountId: string;
  reviseId: string | null;
  practiceId: string | null;
  startWithSample?: boolean;
  availableRevisionImage?: Blob | null;
  rememberRevisionImage: (attemptId: string, image: Blob | null) => void;
}) {
  const router = useRouter();
  const { attempts, status: attemptsStatus, retry: retryAttempts } = useAttempts();

  // The ?sample=1 entry pre-fills the pristine sample text, so every existing
  // sample guard (never graded, never saved, upload controls unmounted)
  // applies exactly as if the student had clicked "Use a sample answer".
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedEarlier, setSavedEarlier] = useState(false);
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const assessedDiagramsEnabled = process.env.NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED === "true";
  const [diagramStatus, setDiagramStatus] = useState<DiagramAttachStatus>("idle");
  const [retainedImage, setRetainedImage] = useState<Blob | null>(null);
  const [diagramConfirmation, setDiagramConfirmation] = useState<PreflightDecision | GradeDecision | null>(null);
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
  const [sourceFromScan, setSourceFromScan] = useState(false);
  // True while a scan extraction is in flight — grading pauses so the scanned
  // text is always reviewable before the grade call.
  const [scanReading, setScanReading] = useState(false);
  // Sample walkthrough (onboarding): a fixed example-feedback view for the
  // UNTOUCHED sample answer. Pure display state — opening it never grades,
  // saves, or counts anything. The ?sample=1 deep link opens it directly.
  const [showWalkthrough, setShowWalkthrough] = useState(startWithSample);
  // Diagram Evidence V1: the processed close-up diagram photo, held as
  // transient local state until grade time (nothing uploads at attach time).
  const diagramImageRef = useRef<Blob | null>(null);
  // Memoised successful review for the CURRENT photo: a grade retry after a
  // grading failure reuses it instead of paying for a second review.
  const diagramReviewRef = useRef<{
    image: Blob;
    operationKey: string;
    evidence: DiagramEvidence;
    reservationId: string;
  } | null>(null);
  const diagramRequestRef = useRef<{
    image: Blob;
    operationKey: string;
    idempotencyKey: string;
  } | null>(null);
  // A photo was attached but its review failed — gentle notice, never blocking.
  const [diagramReviewFailed, setDiagramReviewFailed] = useState(false);

  // --- Revision mode --------------------------------------------------------
  // The original attempt being revised (from the user's own saved attempts).
  const parent = reviseId !== null ? attempts.find((a) => a.id === reviseId) ?? null : null;
  const revisionCtx: RevisionContext | null = useMemo(
    () => (parent !== null ? revisionContextFor(parent) : null),
    [parent]
  );
  const revisionMissing = reviseId !== null && attemptsStatus === "ready" && parent === null;

  // --- Practice mode --------------------------------------------------------
  // The Aptly-generated question being answered (RLS-scoped fetch), either
  // directly (?practice=) or because the revised original answered one.
  const practiceQuestionId = practiceId ?? revisionCtx?.practiceQuestionId ?? null;
  const [practiceRetry, setPracticeRetry] = useState(0);
  const [practiceLoad, setPracticeLoad] = useState<{
    accountId: string;
    questionId: string;
    retry: number;
    status: "ready" | "missing" | "error";
    question: PracticeQuestion | null;
  } | null>(null);
  // A retry or changed linked task is loading immediately, before its effect
  // runs. Never expose a prior request's question as the new task's context.
  const currentPracticeLoad = practiceLoad?.accountId === accountId &&
    practiceLoad.questionId === practiceQuestionId && practiceLoad.retry === practiceRetry
    ? practiceLoad : null;
  const practiceQuestion = currentPracticeLoad?.question ?? null;
  const practiceMissing = currentPracticeLoad?.status === "missing";
  const practiceError = currentPracticeLoad?.status === "error";
  useEffect(() => {
    if (practiceQuestionId === null) return;
    let active = true;
    const supabase = createClient();
    fetchPracticeQuestion(supabase, practiceQuestionId)
      .then((pq) => {
        if (!active) return;
        setPracticeLoad({ accountId, questionId: practiceQuestionId, retry: practiceRetry,
          status: pq === null ? "missing" : "ready", question: pq });
      })
      .catch(() => {
        if (active) setPracticeLoad({ accountId, questionId: practiceQuestionId,
          retry: practiceRetry, status: "error", question: null });
      });
    return () => {
      active = false;
    };
  }, [accountId, practiceQuestionId, practiceRetry]);

  const draftReady = (reviseId === null || parent !== null) &&
    (practiceQuestionId === null || practiceQuestion !== null);
  const draft = useSubmitDraft(accountId, draftTask(reviseId, practiceId), {
    question: startWithSample ? SAMPLE_QUESTION : "",
    answer: startWithSample ? SAMPLE_ANSWER : "", source: "",
  }, draftReady, startWithSample);
  const typedQuestion = draft.text.question;
  const answer = draft.text.answer;
  const stagedSource = draft.text.source || null;
  function setTypedQuestion(value: string) { draft.edit({ question: value }); }
  function setAnswer(value: string) { draft.edit({ answer: value }); }
  function setStagedSource(value: string | null) { draft.edit({ source: value ?? "" }); }

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
  const diagramContract = practiceQuestion?.assessmentContract ?? parent?.assessment?.assessedDiagram?.contract;
  const requiredDiagram = assessedDiagramsEnabled && (
    diagramContract?.diagramRole === "required_explicitly" || diagramContract?.diagramRole === "necessary_for_task" ||
    (!diagramContract && runPreflight(question).templateId === "four_mark_diagram_explain"));

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


  // Guards against concurrent grading calls and duplicate saves.
  const inFlight = useRef(false);
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
    setRetainedImage(null);
    setDiagramStatus(image ? "attached" : "idle");
    diagramReviewRef.current = null;
    diagramRequestRef.current = null;
    setDiagramReviewFailed(false);
    setDiagramConfirmation(null);
    setError(null);
    // Attachments are transient, but every change retires a submission ticket.
    draft.session.edit({});
  }, [draft.session]);

  // One review per photo: reuse the memoised result when the same processed
  // photo is graded again (e.g. retry after a grading failure); only a
  // successful review is memoised, so "try again" paths stay honest.
  async function reviewDiagramOnce(
    image: Blob,
    q: string,
    a: string,
    operationKey: string
  ): Promise<DiagramReviewResult> {
    const memo = diagramReviewRef.current;
    if (memo !== null && memo.image === image && memo.operationKey === operationKey) {
      return {
        evidence: memo.evidence,
        reservationId: memo.reservationId,
        failureMessage: null,
      };
    }
    const pending = diagramRequestRef.current;
    const diagramIdempotencyKey =
      pending !== null && pending.image === image && pending.operationKey === operationKey
        ? pending.idempotencyKey
        : crypto.randomUUID();
    diagramRequestRef.current = { image, operationKey, idempotencyKey: diagramIdempotencyKey };
    const result = await requestDiagramReview(
      image,
      q,
      a,
      diagramIdempotencyKey,
      operationKey
    );
    if (draft.session.isCurrent() && diagramImageRef.current === image &&
        diagramRequestRef.current?.idempotencyKey === diagramIdempotencyKey &&
        result.evidence !== null && result.reservationId !== null) {
      diagramReviewRef.current = {
        image,
        operationKey,
        evidence: result.evidence,
        reservationId: result.reservationId,
      };
    }
    return result;
  }

  // Apply an extraction fill: ONLY empty fields change (computed in
  // lib/scan/apply-extraction.ts). Filling the question invalidates pending
  // preflight state exactly like manual typing does.
  function handleScanFill(fill: ExtractionFill) {
    // Pristine sample mode: a late-arriving extraction (its control was
    // unmounted when the sample filled the form) must never touch the sample
    // state. The ref always holds the CURRENT field values.
    if (isUnmodifiedSample(scanFieldsRef.current.question, scanFieldsRef.current.answer)) return;
    if (fill.question !== null) {
      setTypedQuestion(fill.question);
      setPreflight(null);
      setSourceStep(false);
      setSourceFrameworkHint(null);
      setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    }
    if (fill.answer !== null) setAnswer(fill.answer);
    if (fill.stagedSource !== null) { setStagedSource(fill.stagedSource); setSourceFromScan(true); }
  }

  function fillSample() {
    if (
      (typedQuestion.trim() !== "" || answer.trim() !== "") &&
      !window.confirm("Replace your current question and answer with the sample?")
    ) {
      return;
    }
    draft.discard();
    draft.edit({ question: SAMPLE_QUESTION, answer: SAMPLE_ANSWER }, false);
    // Replacing the question invalidates any pending choice/override for it.
    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    // Pristine sample mode is attachment-free by design: the sample is never
    // graded, so nothing may look gradable alongside it. Both upload controls
    // unmount (their gates check isSample), any staged scan text and diagram
    // photo are dropped, and an in-flight scan can no longer pause grading.
    setSourceFromScan(false);
    setScanReading(false);
    handleDiagramChange(null);
  }

  // The sample paths exist ONLY while both fields hold the untouched sample
  // text (manual flow only). Any edit makes this false and the page behaves
  // exactly like a normal submission — no hidden free-sample treatment.
  const isSample = fixedQuestion === null && isUnmodifiedSample(typedQuestion, answer);

  // A separately opened walkthrough must preserve any unfinished manual draft.
  function handleTryYourOwn() {
    if (startWithSample) {
      router.push("/submit");
      return;
    }
    setShowWalkthrough(false);
    draft.discard();
    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    setSourceFromScan(false);
    handleDiagramChange(null);
  }

  // Step 1: ONE pure, unit-tested decision (lib/assessment/submit-flow.ts)
  // resolves what a "Grade my answer" click does: grade now, open the source
  // step, open the compact chooser, or flag an invalid typed total. A
  // source-dependent revision with no stored source ALWAYS opens the source
  // step first — the paid grading call can never run before that choice.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || grading || !draftReady || !draft.session.isCurrent()) return;
    // Handler-level protection: the pristine sample is NEVER graded — its only
    // path is the free walkthrough. (The Grade CTA is hidden in sample mode;
    // this guard holds even if submit is triggered outside the visible UI.)
    if (isSample) return;
    // A scan is still being read: grading waits so the student always reviews
    // the extracted text before the grade call.
    if (scanReading || diagramStatus === "preparing") return;

    const q = question.trim();
    const a = answer.trim();
    if (q === "" || (a === "" && (!assessedDiagramsEnabled || diagramImageRef.current === null))) return;
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
  async function grade(decision: PreflightDecision | GradeDecision, diagramOmitted = false) {
    if (inFlight.current || grading || !draftReady || !draft.session.isCurrent()) return;
    // Defense in depth (mirrors handleSubmit): pristine sample content can
    // never reach the paid grade call or the diagram review, whatever path
    // tried to invoke grading.
    if (fixedQuestion === null && isUnmodifiedSample(question, answer)) return;

    const q = question.trim();
    const a = answer.trim();
    if (q === "" || diagramStatus === "preparing" || (a === "" && (!assessedDiagramsEnabled || diagramImageRef.current === null))) return;
    if (assessedDiagramsEnabled && diagramStatus === "error") {
      setError("Replace the failed photo, or remove it before submitting without a diagram.");
      return;
    }
    if (requiredDiagram && diagramImageRef.current === null && !diagramOmitted) {
      setDiagramConfirmation(decision);
      return;
    }
    setDiagramConfirmation(null);

    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setError(null);
    setGrading(true);
    inFlight.current = true;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), assessedDiagramsEnabled && diagramImageRef.current ? 125_000 : REQUEST_TIMEOUT_MS + 5000);
    const diagramImage = diagramImageRef.current;
    let imageHash: string | null = null;
    try {
      if (assessedDiagramsEnabled && diagramImage) {
        const bytes = await diagramImage.arrayBuffer();
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        imageHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      setError("Couldn't prepare the diagram. Replace the photo and try again.");
      window.clearTimeout(timer); inFlight.current = false; setGrading(false); return;
    }
    if (!draft.session.isCurrent() || diagramImageRef.current !== diagramImage || (assessedDiagramsEnabled &&
      (draft.session.text.answer.trim() !== a || (fixedQuestion === null && draft.session.text.question.trim() !== q)))) {
      window.clearTimeout(timer); inFlight.current = false; setGrading(false); return;
    }
    const operationSignature = JSON.stringify({
      q,
      a,
      decision,
      practiceQuestionId,
      parentAttemptId: revisionCtx?.parentId ?? null,
      ...(assessedDiagramsEnabled ? { imageHash, diagramOmitted } : {}),
    });
    let ticket;
    try { ticket = await draft.session.beginSubmission(operationSignature); }
    catch {
      setError("Couldn't prepare this request. Your text is still here; please try again.");
      window.clearTimeout(timer); inFlight.current = false; setGrading(false); return;
    }
    const gradeIdempotencyKey = ticket.idempotencyKey;
    if (!draft.session.isCurrent()) {
      window.clearTimeout(timer);
      inFlight.current = false;
      setGrading(false);
      return;
    }

    // Diagram Evidence V1: review the attached photo in PARALLEL with grading.
    // Two separate routes — grading stays text-only and never sees the photo;
    // the review (which never throws) is awaited only AFTER grading succeeds,
    // so a slow or failed review can never block or change written feedback.
    const diagramReview =
      !assessedDiagramsEnabled && diagramImage !== null
        ? reviewDiagramOnce(diagramImage, q, a, gradeIdempotencyKey)
        : null;

    try {
      const payload = {
        subject: "Economics", topic: "Economics", question: q, answer: a,
        requestedSource: decision.requestedSource, requestedTotal: decision.requestedTotal,
        templateId: decision.templateId, requestedFramework: decision.requestedFramework,
        sourceMaterial: decision.sourceMaterial, practiceQuestionId,
        parentAttemptId: revisionCtx?.parentId ?? null, idempotencyKey: gradeIdempotencyKey,
        ...(assessedDiagramsEnabled ? { diagramOmitted } : {}),
      };
      const form = new FormData();
      if (assessedDiagramsEnabled) {
        form.append("payload", JSON.stringify(payload));
        if (diagramImage) form.append("image", diagramImage, "diagram.jpg");
      }
      const res = await fetch("/api/grade", {
        method: "POST",
        ...(assessedDiagramsEnabled ? {} : { headers: { "Content-Type": "application/json" } }),
        // Economics-only; the question type and topic are detected automatically.
        body: assessedDiagramsEnabled ? form : JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!draft.session.isCurrent()) return;
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
        // Ambiguous completion retains its identity for replay. A reconciled
        // failure only marks this key terminal; the next explicit submission
        // creates a fresh operation, with the student's text unchanged.
        if (classifyOperationOutcome(res.status, code) === "terminal_failed" && !draft.session.markTerminalFailure(ticket)) return;
        if (code === "diagram_confirmation_required") {
          setDiagramConfirmation(decision);
          setError(null);
        } else if (code === "diagram_evidence_unassessable") {
          if (!draft.session.markTerminalFailure(ticket)) return;
          setError("The diagram could not be assessed reliably. No completed mark was saved. Replace it with a clear photo and retry, or remove it and explicitly submit without a diagram.");
        } else if (code === "diagram_assessment_disabled") {
          setError("Diagram-aware assessment is currently paused. This saved question needs that assessment mode. Your draft is unchanged; try again when it is available.");
        } else setError(clientMessageForGradeFailure(res.status, code, reference));
        return;
      }

      const { attempt: savedAttempt } = (await res.json()) as { attempt: Attempt };
      if (!draft.session.isCurrent()) return;
      // Grade persistence is complete at this point. Show and broadcast it
      // immediately; the feedback-only diagram review may finish later.
      if (typeof savedAttempt !== "object" || savedAttempt === null || Array.isArray(savedAttempt) || !isUuid(savedAttempt.id)) {
        throw new Error("Missing saved attempt");
      }
      const unchanged = draft.session.saved(ticket);
      if (assessedDiagramsEnabled) rememberRevisionImage(savedAttempt.id, diagramImage);
      draft.refresh();
      if (!unchanged) {
        setSavedEarlier(true);
      } else {
        savedIdRef.current = savedAttempt.id;
        setResult(savedAttempt);
        setSaveState("saved");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      broadcastAttemptsChanged();
      if (assessedDiagramsEnabled) return;
      const feedback = savedAttempt.feedback;
      const assessment = savedAttempt.assessment ?? null;
      const retainedSource = savedAttempt.sourceMaterial ?? null;
      // Manual source retention: keep the attempt's own private copy of the
      // source it was actually graded against (the parent's retained source
      // for revisions, else the pasted source) — but ONLY when the server
      // confirmed usable source, and never for generated practice (its source
      // stays solely in practice_questions).
      // The parallel diagram review (if any). Evidence attaches to THIS
      // attempt only; a failed review resolves to null with a gentle notice.
      let diagramEvidence: DiagramEvidence | null = null;
      if (diagramReview !== null) {
        const review = await diagramReview;
        if (!draft.session.isCurrent()) return;
        if (review.evidence !== null && review.reservationId !== null) {
          try {
            const attach = await fetch("/api/diagram/attach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                attemptId: savedAttempt.id,
                reservationId: review.reservationId,
                evidence: review.evidence,
              }),
            });
            if (attach.ok) diagramEvidence = review.evidence;
            setDiagramReviewFailed(!attach.ok);
          } catch {
            setDiagramReviewFailed(true);
          }
        } else {
          setDiagramReviewFailed(true);
        }
      } else {
        setDiagramReviewFailed(false);
      }
      const attempt: Attempt = {
        id: savedAttempt.id,
        createdAt: savedAttempt.createdAt,
        subject: savedAttempt.subject,
        // Stored topic comes from automatic detection, not a manual selector.
        topic: savedAttempt.topic,
        question: savedAttempt.question,
        answer: savedAttempt.answer,
        feedback,
        assessment: assessment ?? null,
        // Durable Practice Loop links (RLS verifies both belong to this user).
        parentAttemptId: savedAttempt.parentAttemptId ?? null,
        practiceQuestionId: savedAttempt.practiceQuestionId ?? null,
        sourceMaterial: retainedSource,
        // Diagram Evidence V1: structured feedback-only findings (never marks,
        // never image data). Strictly this attempt's own — revisions re-attach.
        diagramEvidence,
      };
      if (unchanged && draft.session.matches(ticket)) setResult(attempt);
    } catch {
      if (draft.session.isCurrent()) setError(clientGradeErrorMessage());
    } finally {
      setGrading(false);
      inFlight.current = false;
      window.clearTimeout(timer);
    }
  }

  function handleRetry() {
    // Successful responses are already durably saved by the grade route.
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
    draft.discard();
    setPreflight(null);
    setSourceStep(false);
    setSourceFrameworkHint(null);
    setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
    setSourceFromScan(false);
    handleDiagramChange(null);
  }

  if (!draftReady) {
    if (reviseId !== null && parent === null && attemptsStatus !== "ready") {
      return <AttemptsLoadNotice status={attemptsStatus} hasData={false} onRetry={retryAttempts} />;
    }
    if (practiceError) {
      return <div className="space-y-3 text-sm text-muted-foreground">
        <p role="alert">We couldn’t load this question. Your draft has not been replaced. Try again to continue the same answer.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setPracticeRetry(value => value + 1)}>
          Try again
        </Button>
      </div>;
    }
    return <div className="space-y-3 text-sm text-muted-foreground">
      <p role="status">{revisionMissing || practiceMissing ? "This question could not be found. Your draft has not been replaced." : "Loading your question…"}</p>
      {(revisionMissing || practiceMissing) && <Link href="/practice" className="text-primary hover:underline">Choose a practice question</Link>}
    </div>;
  }

  // Sample walkthrough: a fixed example — nothing is graded, saved, or counted.
  if (showWalkthrough) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Sample feedback</h1>
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
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Your feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See what worked, what to improve, and what to practise next.
          </p>
        </div>
        <FeedbackResult
          attempt={result}
          saveState={saveState}
          recurring={recurringMistakeSummary(attempts)}
          parentAttempt={parent}
          diagramReviewFailed={diagramReviewFailed}
          onRevise={
            saveState === "saved" && savedIdRef.current !== null
              ? () => router.push(`/submit?revise=${savedIdRef.current}`)
              : undefined
          }
          onRetry={handleRetry}
          onTryAnother={handleTryAnother}
          tryAnotherLabel="Use my own question"
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

  const practiceFocus = practiceQuestion ? savedPracticeFocus(practiceQuestion) : null;
  const heading = isRevision
    ? "Revise this answer"
    : isPractice
      ? "Answer your practice question"
      : "Submit an answer";
  const subheading = isRevision
    ? "Write a fresh answer to the same question. Aptly grades it like any attempt and links it to the original."
    : isPractice
      ? practiceFocus?.source === "current_focus"
        ? "This question was generated from your next focus. Write your answer below."
        : practiceFocus?.source === "answer_feedback"
          ? "This question follows the feedback on your saved answer. Write your answer below."
        : "Write your answer to this Aptly practice question below."
      : "Add your Economics question, then write or upload your answer.";

  // Revision/practice context still loading (attempts or practice fetch).
  const contextLoading =
    (reviseId !== null && parent === null) ||
    (practiceQuestionId !== null && practiceQuestion === null && !practiceMissing);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
      </div>

      {/* Honest fallbacks when a linked context cannot be loaded. */}
      {(revisionMissing || practiceMissing) && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {revisionMissing
              ? "The original attempt could not be found — it may have been deleted. Open Submit to start a fresh answer."
              : "This practice question could not be found — it may have been removed. Generate a new one from Practice."}
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
          {/* Honest about the missing Scan control: photo-to-text fill is a
              new-submission tool by design; the diagram photo review is still
              available on revisions. */}
          <p className="text-sm text-muted-foreground">
            Photo scan isn&apos;t available when revising — type your revised answer. You can
            still attach a close-up diagram photo below.
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
            {practiceFocus ? focusSummary(practiceFocus) : `${practiceProvenanceLabel(false)}: ${practiceQuestion.topicLabel} · ${practiceQuestion.markTotal} marks.`}
          </p>
        </div>
      )}

      {/* One purpose statement (the header above) — the card adds no repeated
          instructions; contextual help appears only when detection needs it. */}
      <Card className="overflow-hidden shadow-[0_18px_55px_-38px_rgba(31,28,89,0.5)]">
        <CardContent className="p-6 md:p-7">
          {(draft.restored || !draft.available || savedEarlier) && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
              <span>{!draft.available
                ? "Temporary draft recovery is unavailable in this tab. Keep a copy of your text before leaving."
                : savedEarlier ? "Your earlier answer was saved to History. Your newer edits are still here."
                : "Draft restored for this question in this tab. Reattach any photo you still need."}</span>
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => {
                draft.discard(); setPreflight(null); setSourceStep(false);
                setSourceFrameworkHint(null); setTotalOverride(DEFAULT_TOTAL_OVERRIDE);
                setSourceFromScan(false); setSavedEarlier(false); setError(null); handleDiagramChange(null);
                setAttachmentVersion(value => value + 1);
              }}>Discard draft</button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <Label htmlFor="question">Question</Label>
              {fixedQuestion !== null ? (
                // Revision/practice: the question is fixed so the trusted
                // context (total, framework, stored source) stays valid.
                <div
                  id="question"
                  className="mt-1 rounded-2xl border border-primary/15 bg-accent/45 px-4 py-3.5 text-sm font-medium leading-relaxed"
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
                    className="min-h-16"
                  />
                  <Link
                    href="/practice"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-accent"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Prefer a generated question?
                  </Link>
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
                required={!assessedDiagramsEnabled}
                maxLength={MAX_ANSWER_CHARS}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={assessedDiagramsEnabled ? "Write your explanation here. You can submit a diagram-only attempt when the task assesses diagrams." : "Write your answer here."}
                className="min-h-72 text-[15px] leading-7"
              />
            </div>

            {assessedDiagramsEnabled && (
              <div className="space-y-2 text-sm text-muted-foreground">
                {diagramContract && <p>{diagramContract.diagramReason}</p>}
                {requiredDiagram && <p className="font-medium text-foreground">This task assesses a diagram. Attach a clear photo, or choose to grade without it.</p>}
                <p className="text-xs">Scan produces editable text. Attach the diagram separately so its actual image can be assessed.</p>
                {isRevision && parent?.assessment?.assessedDiagram && (
                  availableRevisionImage ? <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={grading || diagramStatus === "preparing"}
                      onClick={() => { handleDiagramChange(availableRevisionImage); setRetainedImage(availableRevisionImage); setDiagramStatus("attached"); setAttachmentVersion(v => v + 1); }}>Retain previous diagram</Button>
                    <span className="text-xs">Or attach a replacement below. Removing it submits this revision without that diagram.</span>
                  </div> : <p className="text-xs">The previous photo is no longer available in this tab. Attach it again to retain the diagram, attach a replacement, or submit without it. The saved assessment is unchanged.</p>
                )}
              </div>
            )}

            {/* Aptly Scan: one understated attachment control — manual flow
                only (revision/practice questions are fixed or server-owned,
                so an attachment would have no honest function there), and
                never in pristine sample mode (the sample is never graded, so
                upload controls return only after the sample is edited). */}
            <div className="grid gap-3 empty:hidden md:grid-cols-2">
              {fixedQuestion === null && !isSample && (
                <ScanAttachment
                  key={`scan-${attachmentVersion}`}
                  disabled={grading || preflight !== null}
                  getFields={getScanFields}
                  onFill={handleScanFill}
                  onRemoved={() => { setStagedSource(null); setSourceFromScan(false); }}
                  onReadingChange={setScanReading}
                />
              )}

              {/* Diagram Evidence V1: one optional close-up diagram photo,
                  reviewed separately at grade time — feedback only, never
                  marks. Available in every mode: revising a diagram-explain
                  answer is exactly when a student wants their diagram seen. */}
              {!isSample && (
                <DiagramAttachment
                  key={`diagram-${attachmentVersion}`}
                  disabled={grading || preflight !== null}
                  onAttachedChange={handleDiagramChange}
                  onStatusChange={setDiagramStatus}
                  assessed={assessedDiagramsEnabled}
                  initialImage={retainedImage}
                />
              )}
            </div>

            {diagramConfirmation && !grading && (
              <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50/40 p-4 text-sm dark:bg-amber-950/15" role="alert">
                <p>No diagram is attached. Grading without it treats the diagram as omitted work and applies this task&apos;s assessment contract.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void grade(diagramConfirmation, true)}>Grade without a diagram</Button>
              </div>
            )}


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
                      View the example feedback walkthrough — nothing is graded or saved. Edit the
                      question or answer to grade your own work.
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

            {(error !== null || draft.terminalFailed) && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error ?? clientTerminalGradeFailureMessage()} {!draft.terminalFailed && <Link href="/attempts" className="underline">Check History</Link>}</span>
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
                sourceFromScan={sourceFromScan}
                onSourceChange={setStagedSource}
                onChoose={(d) => void grade(d)}
                onEnterSourceStep={() => setSourceStep(true)}
              />
            )}

            {/* Hide the generic Grade CTA while the source step is active so the
                only grade action is "Grade with this source" — and in pristine
                sample mode, where the ONLY primary action is the free
                walkthrough (editing the sample restores normal grading). */}
            {!sourceStep && !isSample && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="lg" disabled={grading || contextLoading || scanReading || diagramStatus === "preparing"}>
                    {grading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking your answer…
                      </>
                    ) : (
                      draft.terminalFailed ? "Try again as a fresh attempt" : "Grade my answer"
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
                  Your answer is sent to OpenAI for feedback and saved to your account. Don&apos;t
                  include personal information. Aptly provides practice estimates, not official IB grades.
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

    </div>
  );
}
