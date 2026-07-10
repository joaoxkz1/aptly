import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, userIdFromClient } from "@/lib/auth/verified-user";
import { getOpenAI } from "@/lib/ai/openai";
import { fetchAttempts } from "@/lib/supabase/attempts";
import { fetchLatestPracticeQuestion } from "@/lib/supabase/practice-questions";
import { derivePracticeTarget } from "@/lib/assessment/practice-target";
import { reusablePracticeQuestion } from "@/lib/assessment/practice-reuse";
import type { Attempt } from "@/lib/types";
import {
  PRACTICE_JSON_SCHEMA,
  buildPracticeInstructions,
  buildPracticeUserInput,
  validateGeneratedPractice,
} from "@/lib/ai/practice-schema";
import {
  PRACTICE_ERROR_CODE,
  PRACTICE_LIMIT_ERROR_CODE,
  PRACTICE_NO_FOCUS_CODE,
  buildPracticeFailureLog,
  supportReference,
  type PracticeStage,
} from "@/lib/ai/practice-errors";
import {
  DAILY_PRACTICE_GENERATION_LIMIT,
  GRADING_MODEL,
  PRACTICE_MAX_OUTPUT_TOKENS,
  PRACTICE_REQUEST_TIMEOUT_MS,
  REASONING_EFFORT,
} from "@/lib/ai/config";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import {
  markReservationFailed,
  markReservationProcessing,
  markReservationSucceeded,
  reserveAIUsage,
} from "@/lib/ai/usage-reservations";
import {
  findPracticeByIdempotency,
  savePracticeQuestion,
} from "@/lib/supabase/server-authority";

export const runtime = "nodejs";

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const userId = await userIdFromClient(supabase);
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
    Object.keys(raw).some((key) => key !== "regenerate" && key !== "idempotencyKey") ||
    typeof raw.regenerate !== "boolean" ||
    !isUuid(raw.idempotencyKey)
  ) {
    return fail(400, "invalid_request");
  }
  const regenerate = raw.regenerate;
  const idempotencyKey = raw.idempotencyKey;
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

  let attempts: Attempt[];
  try {
    attempts = await fetchAttempts(supabase);
    const latest = await fetchLatestPracticeQuestion(supabase);
    const reusable = reusablePracticeQuestion(latest, attempts);
    if (reusable !== null && !regenerate) {
      return NextResponse.json({ practiceQuestion: reusable, reused: true });
    }
  } catch (err) {
    return failClosed(502, err);
  }

  stage = "target_derivation";
  let target;
  try {
    target = derivePracticeTarget(attempts);
  } catch (err) {
    return failClosed(502, err);
  }
  if (target == null) return fail(409, PRACTICE_NO_FOCUS_CODE);

  stage = "rate_limit";
  try {
    const reservation = await reserveAIUsage({
      userId,
      capability: "practice",
      idempotencyKey,
      fingerprint: requestFingerprint({ regenerate, target }),
      dailyLimit: DAILY_PRACTICE_GENERATION_LIMIT,
    });
    reservationId = reservation.reservationId;
    if (reservation.outcome === "limited") return fail(429, PRACTICE_LIMIT_ERROR_CODE);
    if (reservation.outcome === "conflict") return fail(409, "idempotency_conflict");
    if (reservation.outcome === "in_progress") return fail(409, "request_in_progress");
    if (reservation.outcome === "replay" || reservation.outcome === "failed") {
      const saved = await findPracticeByIdempotency(userId, idempotencyKey);
      if (saved !== null && reservationId !== null) {
        await markReservationSucceeded(reservationId, userId, { practiceId: saved.id });
        return NextResponse.json({ practiceQuestion: saved, reused: true });
      }
      return fail(409, reservation.outcome === "failed" ? "request_failed" : "result_unavailable");
    }
    if (reservationId === null) throw new Error("missing reservation id");
    await markReservationProcessing(reservationId, userId);
  } catch (err) {
    return failClosed(502, err);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRACTICE_REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    providerDispatched = true;
    const response = await getOpenAI().responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: REASONING_EFFORT },
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
    const generated = validateGeneratedPractice(JSON.parse(response.output_text), target);

    stage = "persistence";
    const saved = await savePracticeQuestion(userId, idempotencyKey, {
      question: generated.question,
      sourceMaterial: generated.sourceMaterial,
      framework: target.framework,
      markTotal: target.markTotal,
      topicCode: target.topicCode,
      topicLabel: target.topicLabel,
      skill: target.skill,
      why: target.why,
    });
    await markReservationSucceeded(reservationId, userId, { practiceId: saved.id });
    return NextResponse.json({ practiceQuestion: saved, reused: false });
  } catch (err) {
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
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
