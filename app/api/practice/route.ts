import "server-only";
import { diagramAssessmentEnabled, resolveAssessmentContract } from "@/lib/assessment/trusted-contract";
import { policyForGeneratedPractice } from "@/lib/assessment/policy";
import { approvedFourMarkTemplate, FOUR_MARK_VARIANT_SCHEMA, fourMarkVariantInstructions, validateFourMarkVariant } from "@/lib/ai/four-mark-generation";
import { ESSAY_BLUEPRINT_VERSION, FOUR_MARK_BLUEPRINT_VERSION, type EconomicsBankQuestion } from "@/lib/assessment/question-bank/economics-v1/types";
import { ESSAY_DIAGRAM_AUDIT } from "@/lib/assessment/question-bank/economics-v1/essay-diagram-audit";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, verifiedUserId } from "@/lib/auth/verified-user";
import { readEconomicsCourseLevel } from "@/lib/assessment/course-level";
import { getOpenAI } from "@/lib/ai/openai";
import { fetchAttempts } from "@/lib/supabase/attempts";
import { sameFocus } from "@/lib/assessment/focused-practice";
import { reusablePracticeQuestion } from "@/lib/assessment/practice-reuse";
import { getPracticeAo3Scope } from "@/lib/assessment/practice-generation-scope";
import {
  isCurrentGeneratorTopic,
  isGeneratorMarkTotal,
  resolveQuestionGeneratorTarget,
  PracticeFocusError,
} from "@/lib/assessment/question-generator";
import { ECONOMICS_QUESTION_BANK } from "@/lib/assessment/question-bank/economics-v1";
import {
  ECONOMICS_GRADING_BLUEPRINT_VERSION,
  ECONOMICS_QUESTION_BANK_VERSION,
} from "@/lib/assessment/question-bank/economics-v1/types";
import { selectCuratedQuestion } from "@/lib/assessment/question-bank/economics-v1/selection";
import {
  PRACTICE_JSON_SCHEMA,
  buildPracticeInstructions,
  buildPracticeUserInput,
  validateGeneratedPractice,
} from "@/lib/ai/practice-schema";
import {
  PRACTICE_ERROR_CODE,
  PRACTICE_LEVEL_REQUIRED_CODE,
  PRACTICE_LIMIT_ERROR_CODE,
  buildPracticeFailureLog,
  supportReference,
  type PracticeStage,
} from "@/lib/ai/practice-errors";
import {
  DAILY_PRACTICE_GENERATION_LIMIT,
  PRACTICE_MAX_OUTPUT_TOKENS,
  PRACTICE_MODEL,
  PRACTICE_REQUEST_TIMEOUT_MS,
  PRACTICE_REASONING_EFFORT,
} from "@/lib/ai/config";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import {
  markReservationFailed,
  markReservationProcessing,
  markReservationSucceeded,
  reserveAIUsage,
} from "@/lib/ai/usage-reservations";
import {
  PracticeIdempotencyConflictError,
  fetchPracticeBankHistory,
  findPracticeByIdempotency,
  savePracticeQuestion,
  fetchLatestTrustedPracticeQuestion,
} from "@/lib/supabase/server-authority";

export const runtime = "nodejs";

const REQUEST_CONTEXTS = ["general", "current_focus", "answer_feedback"] as const;
type RequestContext = (typeof REQUEST_CONTEXTS)[number];

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | null | undefined;
  const userId = verifiedUserId(claims);
  if (userId === null) return fail(401, "unauthorized");

  let raw: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
    raw = body as Record<string, unknown>;
  } catch {
    return fail(400, "invalid_request");
  }
  if (
    Object.keys(raw).some(
      (key) =>
        !["marks", "topicCode", "context", "sourceAttemptId", "regenerate", "idempotencyKey"].includes(key)
    ) ||
    !isGeneratorMarkTotal(raw.marks) ||
    !isCurrentGeneratorTopic(raw.topicCode) ||
    typeof raw.context !== "string" ||
    !(REQUEST_CONTEXTS as readonly string[]).includes(raw.context) ||
    typeof raw.regenerate !== "boolean" ||
    !isUuid(raw.idempotencyKey) ||
    (raw.context === "answer_feedback" ? !isUuid(raw.sourceAttemptId) : raw.sourceAttemptId != null)
  ) {
    return fail(400, "invalid_request");
  }

  const marks = raw.marks;
  if (marks === 4 && !diagramAssessmentEnabled()) return fail(503, "diagram_assessment_disabled");
  const topicCode = raw.topicCode;
  const context = raw.context as RequestContext;
  const regenerate = raw.regenerate;
  const idempotencyKey = raw.idempotencyKey;
  const sourceAttemptId = typeof raw.sourceAttemptId === "string" ? raw.sourceAttemptId : null;
  const courseLevel = readEconomicsCourseLevel(claims?.user_metadata);
  if (courseLevel === null) return fail(409, PRACTICE_LEVEL_REQUIRED_CODE);

  const fingerprint = requestFingerprint({
    marks,
    topicCode,
    context,
    regenerate,
    courseLevel,
    // Keep general-request fingerprints stable. Old focused requests used a
    // weaker contract, so do not replay them as newly verified personalization.
    ...(context === "general" ? {} : { sourceAttemptId, focusContract: 1 }),
  });
  const requestId = crypto.randomUUID();
  let stage: PracticeStage = "reuse_lookup";
  let reservationId: string | null = null;
  let providerDispatched = false;

  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildPracticeFailureLog(stage, requestId, err, status)));
    return NextResponse.json(
      { error: context === "general" ? PRACTICE_ERROR_CODE : "focused_generation_failed", reference: supportReference(requestId) },
      { status }
    );
  }

  try {
    const replay = await findPracticeByIdempotency(userId, idempotencyKey, fingerprint);
    if (replay !== null) {
      return NextResponse.json({ practiceQuestion: replay, reused: true });
    }
  } catch (error) {
    if (error instanceof PracticeIdempotencyConflictError) {
      return fail(409, "idempotency_conflict");
    }
    return failClosed(502, error);
  }

  let attempts;
  let target;
  try {
    const [savedAttempts, latest] = await Promise.all([
      fetchAttempts(supabase),
      fetchLatestTrustedPracticeQuestion(userId),
    ]);
    attempts = savedAttempts;
    target = resolveQuestionGeneratorTarget({
      marks,
      topicCode,
      courseLevel,
      attempts,
      requestCurrentFocus: context === "current_focus",
      source: context === "general" ? undefined : context,
      sourceAttemptId,
    });
    const reusable = reusablePracticeQuestion(latest?.question ?? null, attempts);
    // A new request must not revive retired content or superseded private criteria.
    // Exact idempotent replay above still returns its original saved question.
    const latestBankEntry = latest?.bankQuestionId
      ? ECONOMICS_QUESTION_BANK.find(entry => entry.id === latest.bankQuestionId) : null;
    const currentCriteria = [ECONOMICS_GRADING_BLUEPRINT_VERSION, FOUR_MARK_BLUEPRINT_VERSION, ESSAY_BLUEPRINT_VERSION]
      .includes(latest?.gradingBlueprintVersion as typeof ECONOMICS_GRADING_BLUEPRINT_VERSION);
    const sameRequestedFrame =
      reusable !== null &&
      currentCriteria &&
      (!latest?.bankQuestionId || (latestBankEntry != null && latestBankEntry.qualityStatus !== "deprecated"
        && (courseLevel === "hl" || latestBankEntry.levelRelevance === "shared_sl_hl"))) &&
      reusable.markTotal === marks &&
      reusable.topicCode === topicCode &&
      (marks === 4 && target.focus === null || reusable.framework === target.framework) &&
      (latest?.levelRelevance === "shared_sl_hl" || latest?.levelRelevance === "hl_only") &&
      (courseLevel === "hl" || latest?.levelRelevance === "shared_sl_hl") &&
      (marks === 4 && target.focus === null || latest?.targetSkills.includes(target.targetSkill)) &&
      sameFocus(reusable.focus, target.focus) &&
      (target.focus !== null || reusable.fromCurrentFocus !== true);
    if (sameRequestedFrame && !regenerate) {
      return NextResponse.json({ practiceQuestion: reusable, reused: true });
    }
  } catch (error) {
    if (error instanceof PracticeFocusError) return fail(409, error.code);
    if (error instanceof Error && error.message === "topic is HL-only") {
      return fail(403, "topic_not_available_for_level");
    }
    return failClosed(502, error);
  }

  stage = "bank_selection";
  try {
    const history = await fetchPracticeBankHistory(userId);
    const selected = selectCuratedQuestion(
      ECONOMICS_QUESTION_BANK,
      {
        marks,
        topicCode,
        courseLevel,
        targetSkill: marks === 4 && target.focus === null ? null : target.targetSkill,
        framework: marks === 4 && target.focus === null ? undefined : target.framework,
        requireSkill: target.focus !== null,
        evidenceQuestion: target.evidenceQuestion,
      },
      history,
      `${userId}:${idempotencyKey}`
    );
    if (selected !== null) {
      const saved = await savePracticeQuestion(userId, idempotencyKey, {
        question: selected.question,
        sourceMaterial: selected.sourceMaterial ?? null,
        framework: selected.framework,
        markTotal: selected.marks,
        topicCode: selected.topicCode,
        topicLabel: target.topicLabel,
        skill: target.focus ? target.targetSkill : selected.targetSkills[0] ?? target.targetSkill,
        why: target.why,
        questionOrigin: "curated_bank",
        bankQuestionId: selected.id,
        questionBankVersion: ECONOMICS_QUESTION_BANK_VERSION,
        gradingBlueprint: diagramAssessmentEnabled() && selected.gradingBlueprint.kind === "extended" ? {
          ...selected.gradingBlueprint,
          diagramRequirement: ESSAY_DIAGRAM_AUDIT[selected.id],
          diagramPolicy: resolveAssessmentContract({ policy: policyForGeneratedPractice({ framework: selected.framework, markTotal: selected.marks, sourceMaterial: selected.sourceMaterial ?? null }),
            question: selected.question, topic: selected.topicCode, sourceMaterial: selected.sourceMaterial ?? null, blueprint: selected.gradingBlueprint, bankQuestionId: selected.id })!.diagramReason,
        } : selected.gradingBlueprint,
        gradingBlueprintVersion: diagramAssessmentEnabled() && selected.gradingBlueprint.kind === "extended" ? ESSAY_BLUEPRINT_VERSION : selected.gradingBlueprintVersion,
        levelRelevance: selected.levelRelevance,
        commandTerm: selected.commandTerm,
        targetSkills: selected.targetSkills,
        angleTags: selected.angleTags,
        fromCurrentFocus: target.fromCurrentFocus,
        focus: target.focus,
        requestFingerprint: fingerprint,
      });
      return NextResponse.json({ practiceQuestion: saved, reused: false });
    }
  } catch (error) {
    if (error instanceof PracticeIdempotencyConflictError) {
      return fail(409, "idempotency_conflict");
    }
    return failClosed(502, error);
  }

  // Exhaustion of COMPATIBLE questions (including zero matches) uses the same
  // GPT-5.4 operation/reservation. Unrelated bank questions never block fallback.
  // Only adaptive fallback is gated: reviewed curated exceptions and exact
  // idempotent replays have already returned, before any quota/provider work.
  if (marks === 15) {
    const scope = getPracticeAo3Scope(target.topicCode, courseLevel);
    if (scope === null) return fail(422, target.focus ? "unsupported_focus" : "no_supported_question");
    target = { ...target, levelRelevance: scope.levelRelevance };
  }
  const approvedTemplate = marks === 4 ? approvedFourMarkTemplate(ECONOMICS_QUESTION_BANK, target, target.focus !== null) : null;
  if (marks === 4 && approvedTemplate == null) return fail(422, target.focus ? "unsupported_focus" : "four_mark_topic_unsupported");
  stage = "rate_limit";
  try {
    const reservation = await reserveAIUsage({
      userId,
      capability: "practice",
      idempotencyKey,
      fingerprint,
      dailyLimit: DAILY_PRACTICE_GENERATION_LIMIT,
    });
    reservationId = reservation.reservationId;
    if (reservation.outcome === "limited") return fail(429, PRACTICE_LIMIT_ERROR_CODE);
    if (reservation.outcome === "conflict") return fail(409, "idempotency_conflict");
    if (reservation.outcome === "in_progress") return fail(409, "request_in_progress");
    if (reservation.outcome === "replay" || reservation.outcome === "failed") {
      const saved = await findPracticeByIdempotency(userId, idempotencyKey, fingerprint);
      if (saved !== null && reservationId !== null) {
        await markReservationSucceeded(reservationId, userId, { practiceId: saved.id });
        return NextResponse.json({ practiceQuestion: saved, reused: true });
      }
      return fail(
        409,
        reservation.outcome === "failed" ? "request_failed" : "result_unavailable"
      );
    }
    if (reservationId === null) throw new Error("missing reservation id");
    await markReservationProcessing(reservationId, userId);
  } catch (error) {
    if (error instanceof PracticeIdempotencyConflictError) {
      return fail(409, "idempotency_conflict");
    }
    return failClosed(502, error);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRACTICE_REQUEST_TIMEOUT_MS);
  try {
    let generated: (ReturnType<typeof validateGeneratedPractice> & { sourceMaterial?: string; template?: EconomicsBankQuestion }) | null = null;
    let lastGenerationError: unknown = null;
    for (let attemptNumber = 0; attemptNumber < 2 && generated === null; attemptNumber += 1) {
      try {
      stage = "openai";
      providerDispatched = true;
      const response = await getOpenAI().responses.create(
        {
          model: PRACTICE_MODEL,
          reasoning: { effort: PRACTICE_REASONING_EFFORT },
          max_output_tokens: PRACTICE_MAX_OUTPUT_TOKENS,
          store: false,
          input: [
            { role: "developer", content: approvedTemplate ? fourMarkVariantInstructions(approvedTemplate) : buildPracticeInstructions() },
            { role: "user", content: approvedTemplate ? `Approved template ${approvedTemplate.id}. Return one fictional case name.` : buildPracticeUserInput(target) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "aptly_practice_question",
              strict: true,
              schema: approvedTemplate ? FOUR_MARK_VARIANT_SCHEMA : PRACTICE_JSON_SCHEMA,
            },
          },
        },
        { signal: controller.signal, maxRetries: 0 }
      );
      stage = "structured_output";
      if (response.status !== "completed") throw new Error(`model status ${response.status}`);
      if (typeof response.output_text !== "string" || response.output_text.trim() === "") {
        throw new Error("empty model output");
      }
      stage = "schema_validation";
        generated = approvedTemplate ? validateFourMarkVariant(JSON.parse(response.output_text), approvedTemplate, target) : validateGeneratedPractice(JSON.parse(response.output_text), target);
      } catch (error) {
        lastGenerationError = error;
        if (controller.signal.aborted) throw error;
      }
    }
    if (generated === null) throw lastGenerationError ?? new Error("invalid generated practice");

    stage = "persistence";
    const saved = await savePracticeQuestion(userId, idempotencyKey, {
      question: generated.question,
      sourceMaterial: generated.sourceMaterial ?? null,
      framework: generated.template?.framework ?? target.framework,
      markTotal: target.markTotal,
      topicCode: target.topicCode,
      topicLabel: target.topicLabel,
      skill: target.focus ? target.targetSkill : generated.targetSkills[0] ?? target.targetSkill,
      why: target.why,
      questionOrigin: "adaptive_generated",
      generationProvenance: { modelId: PRACTICE_MODEL, reasoningEffort: PRACTICE_REASONING_EFFORT, schemaHash: requestFingerprint(approvedTemplate ? FOUR_MARK_VARIANT_SCHEMA : PRACTICE_JSON_SCHEMA) },
      bankQuestionId: null,
      questionBankVersion: null,
      gradingBlueprint: generated.gradingBlueprint,
      gradingBlueprintVersion: generated.template?.gradingBlueprintVersion ?? ECONOMICS_GRADING_BLUEPRINT_VERSION,
      levelRelevance: generated.template?.levelRelevance ?? target.levelRelevance,
      commandTerm: generated.commandTerm,
      targetSkills: generated.targetSkills,
      angleTags: generated.angleTags,
      fromCurrentFocus: target.fromCurrentFocus,
      focus: target.focus,
      requestFingerprint: fingerprint,
    });
    await markReservationSucceeded(reservationId, userId, { practiceId: saved.id });
    return NextResponse.json({ practiceQuestion: saved, reused: false });
  } catch (error) {
    await markReservationFailed(
      reservationId,
      userId,
      providerDispatched
        ? stage === "persistence"
          ? "persistence"
          : stage === "schema_validation"
            ? "validation"
            : "provider"
        : "internal"
    );
    return failClosed(502, error);
  } finally {
    clearTimeout(timer);
  }
}
