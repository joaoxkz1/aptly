import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, verifiedUserId } from "@/lib/auth/verified-user";
import { readEconomicsCourseLevel } from "@/lib/assessment/course-level";
import { getOpenAI } from "@/lib/ai/openai";
import { fetchAttempts } from "@/lib/supabase/attempts";
import { fetchLatestPracticeQuestion } from "@/lib/supabase/practice-questions";
import { reusablePracticeQuestion } from "@/lib/assessment/practice-reuse";
import {
  isCurrentGeneratorTopic,
  isGeneratorMarkTotal,
  resolveQuestionGeneratorTarget,
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
} from "@/lib/supabase/server-authority";

export const runtime = "nodejs";

const REQUEST_CONTEXTS = ["general", "current_focus"] as const;
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
        !["marks", "topicCode", "context", "regenerate", "idempotencyKey"].includes(key)
    ) ||
    !isGeneratorMarkTotal(raw.marks) ||
    !isCurrentGeneratorTopic(raw.topicCode) ||
    typeof raw.context !== "string" ||
    !(REQUEST_CONTEXTS as readonly string[]).includes(raw.context) ||
    typeof raw.regenerate !== "boolean" ||
    !isUuid(raw.idempotencyKey)
  ) {
    return fail(400, "invalid_request");
  }

  const marks = raw.marks;
  const topicCode = raw.topicCode;
  const context = raw.context as RequestContext;
  const regenerate = raw.regenerate;
  const idempotencyKey = raw.idempotencyKey;
  const courseLevel = readEconomicsCourseLevel(claims?.user_metadata);
  if (courseLevel === null) return fail(409, PRACTICE_LEVEL_REQUIRED_CODE);

  const fingerprint = requestFingerprint({
    marks,
    topicCode,
    context,
    regenerate,
    courseLevel,
  });
  const requestId = crypto.randomUUID();
  let stage: PracticeStage = "reuse_lookup";
  let reservationId: string | null = null;
  let providerDispatched = false;

  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildPracticeFailureLog(stage, requestId, err, status)));
    return NextResponse.json(
      { error: PRACTICE_ERROR_CODE, reference: supportReference(requestId) },
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
      fetchLatestPracticeQuestion(supabase),
    ]);
    attempts = savedAttempts;
    target = resolveQuestionGeneratorTarget({
      marks,
      topicCode,
      courseLevel,
      attempts,
      requestCurrentFocus: context === "current_focus",
    });
    const reusable = reusablePracticeQuestion(latest, attempts);
    const sameRequestedFrame =
      reusable !== null &&
      reusable.markTotal === marks &&
      reusable.topicCode === topicCode &&
      (context !== "current_focus" || reusable.fromCurrentFocus === true);
    if (sameRequestedFrame && !regenerate) {
      return NextResponse.json({ practiceQuestion: reusable, reused: true });
    }
  } catch (error) {
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
        targetSkill: target.targetSkill,
      },
      history,
      `${userId}:${idempotencyKey}`
    );
    if (selected !== null) {
      const saved = await savePracticeQuestion(userId, idempotencyKey, {
        question: selected.question,
        sourceMaterial: null,
        framework: selected.framework,
        markTotal: selected.marks,
        topicCode: selected.topicCode,
        topicLabel: target.topicLabel,
        skill: selected.targetSkills[0] ?? target.targetSkill,
        why: target.why,
        questionOrigin: "curated_bank",
        bankQuestionId: selected.id,
        questionBankVersion: ECONOMICS_QUESTION_BANK_VERSION,
        gradingBlueprint: selected.gradingBlueprint,
        gradingBlueprintVersion: selected.gradingBlueprintVersion,
        levelRelevance: selected.levelRelevance,
        commandTerm: selected.commandTerm,
        targetSkills: selected.targetSkills,
        angleTags: selected.angleTags,
        fromCurrentFocus: target.fromCurrentFocus,
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

  // True curated-bank exhaustion is the only path that reserves and calls the
  // existing GPT-5.4 Practice generator.
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
    let generated: ReturnType<typeof validateGeneratedPractice> | null = null;
    let lastValidationError: unknown = null;
    for (let attemptNumber = 0; attemptNumber < 2 && generated === null; attemptNumber += 1) {
      stage = "openai";
      providerDispatched = true;
      const response = await getOpenAI().responses.create(
        {
          model: PRACTICE_MODEL,
          reasoning: { effort: PRACTICE_REASONING_EFFORT },
          max_output_tokens: PRACTICE_MAX_OUTPUT_TOKENS,
          store: false,
          input: [
            { role: "developer", content: buildPracticeInstructions() },
            { role: "user", content: buildPracticeUserInput(target) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "aptly_practice_question",
              strict: true,
              schema: PRACTICE_JSON_SCHEMA,
            },
          },
        },
        { signal: controller.signal }
      );
      stage = "structured_output";
      if (response.status !== "completed") throw new Error(`model status ${response.status}`);
      if (typeof response.output_text !== "string" || response.output_text.trim() === "") {
        throw new Error("empty model output");
      }
      stage = "schema_validation";
      try {
        generated = validateGeneratedPractice(JSON.parse(response.output_text), target);
      } catch (error) {
        lastValidationError = error;
      }
    }
    if (generated === null) throw lastValidationError ?? new Error("invalid generated practice");

    stage = "persistence";
    const saved = await savePracticeQuestion(userId, idempotencyKey, {
      question: generated.question,
      sourceMaterial: null,
      framework: target.framework,
      markTotal: target.markTotal,
      topicCode: target.topicCode,
      topicLabel: target.topicLabel,
      skill: generated.targetSkills[0] ?? target.targetSkill,
      why: target.why,
      questionOrigin: "adaptive_generated",
      bankQuestionId: null,
      questionBankVersion: null,
      gradingBlueprint: generated.gradingBlueprint,
      gradingBlueprintVersion: ECONOMICS_GRADING_BLUEPRINT_VERSION,
      levelRelevance: target.levelRelevance,
      commandTerm: generated.commandTerm,
      targetSkills: generated.targetSkills,
      angleTags: generated.angleTags,
      fromCurrentFocus: target.fromCurrentFocus,
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
