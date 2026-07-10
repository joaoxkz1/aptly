import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userIdFromClient, isUuid } from "@/lib/auth/verified-user";
import { getOpenAI } from "@/lib/ai/openai";
import { getRubric } from "@/lib/ai/rubric.economics";
import {
  GRADE_RESULT_JSON_SCHEMA,
  buildAssessmentInstructions,
  buildAssessmentUserInput,
  validateGradeResult,
} from "@/lib/ai/assessment-schema";
import {
  enforceRevisionSourceGate,
  policyForGeneratedPractice,
  resolveScoringPolicy,
  type RequestedSource,
  type ScoringPolicy,
} from "@/lib/assessment/policy";
import {
  DAILY_LIMIT_ERROR_CODE,
  GRADE_ERROR_CODE,
  buildGradeFailureLog,
  supportReference,
  type GradeStage,
} from "@/lib/ai/grade-errors";
import { ASSESSMENT_FRAMEWORKS } from "@/lib/assessment/taxonomy";
import type { AssessmentFramework } from "@/lib/types";
import {
  DAILY_GRADE_LIMIT,
  GRADING_MODEL,
  MAX_ANSWER_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  MAX_TOPIC_CHARS,
  REASONING_EFFORT,
  REQUEST_TIMEOUT_MS,
  isGradableSubject,
} from "@/lib/ai/config";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import {
  markReservationFailed,
  markReservationProcessing,
  markReservationSucceeded,
  reserveAIUsage,
} from "@/lib/ai/usage-reservations";
import {
  findAttemptById,
  findAttemptByIdempotency,
  saveGradeAttempt,
} from "@/lib/supabase/server-authority";

export const runtime = "nodejs";

const REQUESTED_SOURCES: readonly RequestedSource[] = [
  "explicit",
  "user_confirmed",
  "template_inferred",
  "unknown",
  "feedback_only",
];
const ALLOWED_FIELDS = new Set([
  "subject",
  "topic",
  "question",
  "answer",
  "requestedSource",
  "requestedTotal",
  "templateId",
  "requestedFramework",
  "sourceMaterial",
  "practiceQuestionId",
  "parentAttemptId",
  "idempotencyKey",
]);

function parseRequestedSource(value: unknown): RequestedSource | null {
  return typeof value === "string" && (REQUESTED_SOURCES as readonly string[]).includes(value)
    ? (value as RequestedSource)
    : null;
}

function parseFramework(value: unknown): AssessmentFramework | null {
  return typeof value === "string" && (ASSESSMENT_FRAMEWORKS as readonly string[]).includes(value)
    ? (value as AssessmentFramework)
    : null;
}

function fail(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

function optionalUuid(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  return isUuid(value) ? value : undefined;
}

export async function POST(request: Request) {
  // Authentication always uses the normal cookie-scoped client. Privileged
  // persistence is not reachable until a verified subject has been derived.
  const supabase = await createClient();
  const userId = await userIdFromClient(supabase);
  if (userId === null) return fail(401, "unauthorized");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, "invalid_request");
  }
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !ALLOWED_FIELDS.has(key))) {
    return fail(400, "invalid_request");
  }
  const { subject, topic, question, answer, idempotencyKey } = raw;
  if (
    typeof subject !== "string" ||
    typeof topic !== "string" ||
    typeof question !== "string" ||
    typeof answer !== "string" ||
    !isUuid(idempotencyKey)
  ) {
    return fail(400, "invalid_request");
  }
  if (
    (raw.sourceMaterial != null && typeof raw.sourceMaterial !== "string") ||
    (raw.requestedSource != null && parseRequestedSource(raw.requestedSource) === null) ||
    (raw.requestedTotal != null && typeof raw.requestedTotal !== "number") ||
    (raw.templateId != null && typeof raw.templateId !== "string") ||
    (raw.requestedFramework != null && parseFramework(raw.requestedFramework) === null)
  ) {
    return fail(400, "invalid_request");
  }
  const parentAttemptId = optionalUuid(raw.parentAttemptId);
  const practiceQuestionId = optionalUuid(raw.practiceQuestionId);
  if (parentAttemptId === undefined || practiceQuestionId === undefined) {
    return fail(400, "invalid_request");
  }

  const q = question.trim();
  const a = answer.trim();
  const t = topic.trim();
  if (q === "" || a === "" || t === "") return fail(400, "invalid_request");
  let sourceMaterial =
    typeof raw.sourceMaterial === "string" ? raw.sourceMaterial.trim() : null;
  if (sourceMaterial !== null && sourceMaterial === a) sourceMaterial = null;
  if (
    q.length > MAX_QUESTION_CHARS ||
    a.length > MAX_ANSWER_CHARS ||
    t.length > MAX_TOPIC_CHARS ||
    (sourceMaterial !== null && sourceMaterial.length > MAX_QUESTION_CHARS)
  ) {
    return fail(400, "too_long");
  }
  if (!isGradableSubject(subject)) return fail(422, "subject_unsupported");
  const rubric = getRubric(subject);
  if (rubric === null) return fail(422, "subject_unsupported");

  const requestId = crypto.randomUUID();
  let stage: GradeStage = "assessment_policy";
  let reservationId: string | null = null;
  let providerDispatched = false;

  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildGradeFailureLog(stage, requestId, err, status)));
    return NextResponse.json(
      { error: GRADE_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  // Resolve every relationship and scoring gate through the user's RLS-scoped
  // session before reserving paid capacity or touching the admin client.
  let gradedQuestion = q;
  let policy: ScoringPolicy;
  if (practiceQuestionId !== null) {
    stage = "practice_context";
    try {
      const { data: pq, error } = await supabase
        .from("practice_questions")
        .select("question, source_material, framework, mark_total, authority_version")
        .eq("id", practiceQuestionId)
        .eq("authority_version", 1)
        .maybeSingle();
      if (error) throw error;
      if (pq == null) return fail(400, "invalid_request");
      const row = pq as {
        question: string;
        source_material: string | null;
        framework: string;
        mark_total: number;
      };
      gradedQuestion = row.question;
      sourceMaterial = row.source_material;
      policy = policyForGeneratedPractice({
        framework: row.framework,
        markTotal: row.mark_total,
        sourceMaterial: row.source_material,
      });
    } catch (err) {
      return failClosed(502, err);
    }
  } else {
    let parentFramework: string | null = null;
    if (parentAttemptId !== null) {
      stage = "revision_context";
      try {
        const { data: parent, error } = await supabase
          .from("attempts")
          .select("source_material, assessment")
          .eq("id", parentAttemptId)
          .maybeSingle();
        if (error) throw error;
        if (parent == null) return fail(400, "invalid_request");
        const row = parent as {
          source_material: string | null;
          assessment: { framework?: unknown } | null;
        };
        if (typeof row.source_material === "string" && row.source_material.trim() !== "") {
          sourceMaterial = row.source_material;
        }
        parentFramework =
          typeof row.assessment?.framework === "string" ? row.assessment.framework : null;
      } catch (err) {
        return failClosed(502, err);
      }
    }
    stage = "assessment_policy";
    policy = resolveScoringPolicy(q, {
      requestedSource: parseRequestedSource(raw.requestedSource),
      requestedTotal: typeof raw.requestedTotal === "number" ? raw.requestedTotal : null,
      templateId: typeof raw.templateId === "string" ? raw.templateId : null,
      requestedFramework: parseFramework(raw.requestedFramework),
      sourceMaterial,
    });
    policy = enforceRevisionSourceGate(policy, parentFramework, sourceMaterial);
  }

  // Reserve atomically immediately before dispatch. Invalid/contextless work
  // never consumes quota; every provider-dispatched request does.
  stage = "rate_limit";
  try {
    const reservation = await reserveAIUsage({
      userId,
      capability: "grade",
      idempotencyKey,
      fingerprint: requestFingerprint(raw),
      dailyLimit: DAILY_GRADE_LIMIT,
    });
    reservationId = reservation.reservationId;
    if (reservation.outcome === "limited") return fail(429, DAILY_LIMIT_ERROR_CODE);
    if (reservation.outcome === "conflict") return fail(409, "idempotency_conflict");
    if (reservation.outcome === "in_progress") return fail(409, "request_in_progress");
    if (reservation.outcome === "replay" || reservation.outcome === "failed") {
      const saved =
        (reservation.relatedAttemptId !== null
          ? await findAttemptById(userId, reservation.relatedAttemptId)
          : null) ?? (await findAttemptByIdempotency(userId, idempotencyKey));
      if (saved !== null && reservationId !== null) {
        await markReservationSucceeded(reservationId, userId, { attemptId: saved.id });
        return NextResponse.json({ attempt: saved, replayed: true });
      }
      return fail(409, reservation.outcome === "failed" ? "request_failed" : "result_unavailable");
    }
    if (reservationId === null) throw new Error("missing reservation id");
    await markReservationProcessing(reservationId, userId);
  } catch (err) {
    return failClosed(502, err);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    providerDispatched = true;
    const response = await getOpenAI().responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        input: [
          { role: "developer", content: buildAssessmentInstructions() },
          {
            role: "user",
            content: buildAssessmentUserInput(
              subject,
              t,
              gradedQuestion,
              a,
              rubric,
              false,
              policy,
              policy.sourceMaterialProvided === true ? sourceMaterial : null
            ),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aptly_grade_result",
            strict: true,
            schema: GRADE_RESULT_JSON_SCHEMA,
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
    const parsed: unknown = JSON.parse(response.output_text);
    stage = "schema_validation";
    const { feedback, assessment } = validateGradeResult(parsed, {
      hasImageAttachment: false,
      policy,
    });

    stage = "persistence";
    const attempt = await saveGradeAttempt(userId, idempotencyKey, {
      subject,
      topic: assessment.topicLabel.trim() || t,
      question: gradedQuestion,
      answer: a,
      feedback,
      assessment,
      parentAttemptId,
      practiceQuestionId,
      sourceMaterial:
        practiceQuestionId === null && assessment.sourceMaterialProvided === true
          ? sourceMaterial
          : null,
    });
    await markReservationSucceeded(reservationId, userId, { attemptId: attempt.id });
    return NextResponse.json({ attempt, replayed: false });
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
