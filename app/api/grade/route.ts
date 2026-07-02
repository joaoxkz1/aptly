import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/openai";
import { getRubric } from "@/lib/ai/rubric.economics";
import {
  GRADE_RESULT_JSON_SCHEMA,
  buildAssessmentInstructions,
  buildAssessmentUserInput,
  validateGradeResult,
} from "@/lib/ai/assessment-schema";
import { resolveScoringPolicy, type RequestedSource } from "@/lib/assessment/policy";
import {
  DAILY_LIMIT_ERROR_CODE,
  GRADE_ERROR_CODE,
  buildGradeFailureLog,
  supportReference,
  type GradeStage,
} from "@/lib/ai/grade-errors";
import { dailyLimitReached, utcDayStartIso } from "@/lib/ai/rate-limit";
import { ASSESSMENT_FRAMEWORKS } from "@/lib/assessment/taxonomy";
import type { AssessmentFramework } from "@/lib/types";
import {
  DAILY_GRADE_LIMIT,
  GRADING_MODEL,
  MAX_ANSWER_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  REASONING_EFFORT,
  REQUEST_TIMEOUT_MS,
  isGradableSubject,
} from "@/lib/ai/config";

const REQUESTED_SOURCES: readonly RequestedSource[] = [
  "explicit",
  "user_confirmed",
  "template_inferred",
  "unknown",
  "feedback_only",
];

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

export const runtime = "nodejs";

// Generic error helper — never leaks internals (no key, answer, raw response,
// stack, or headers) to the client.
function fail(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  // 1. Require an authenticated user (verified via getClaims, not getSession).
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims == null) {
    return fail(401, "unauthorized");
  }

  // 2. Parse + validate the body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_request");
  }
  const { subject, topic, question, answer } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof subject !== "string" ||
    typeof topic !== "string" ||
    typeof question !== "string" ||
    typeof answer !== "string"
  ) {
    return fail(400, "invalid_request");
  }

  const q = question.trim();
  const a = answer.trim();
  const t = topic.trim();
  if (q === "" || a === "" || t === "") {
    return fail(400, "invalid_request");
  }
  // Optional source text/data for Paper 2(g)/3(b). Text only this release.
  const sourceRaw = (body ?? {}) as Record<string, unknown>;
  let sourceMaterial =
    typeof sourceRaw.sourceMaterial === "string" ? sourceRaw.sourceMaterial.trim() : null;
  // The student's answer is never source material — a re-paste of the answer
  // into the source box must not unlock a confirmed data-response estimate.
  if (sourceMaterial !== null && sourceMaterial === a) {
    sourceMaterial = null;
  }
  if (q.length > MAX_QUESTION_CHARS || a.length > MAX_ANSWER_CHARS) {
    return fail(400, "too_long");
  }
  if (sourceMaterial != null && sourceMaterial.length > MAX_QUESTION_CHARS) {
    return fail(400, "too_long");
  }

  // 3. Economics-only in v1. Refuse other subjects (no generic rubric).
  if (!isGradableSubject(subject)) {
    return fail(422, "subject_unsupported");
  }
  const rubric = getRubric(subject);
  if (rubric === null) {
    return fail(422, "subject_unsupported");
  }

  const requestId = crypto.randomUUID();
  let stage: GradeStage = "rate_limit";

  // Production-safe failure response: one structured log event (never the
  // question, answer, source, email, id, key, or raw model output) plus a
  // generic client code carrying a short non-secret support reference.
  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildGradeFailureLog(stage, requestId, err, status)));
    return NextResponse.json(
      { error: GRADE_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  // 3b. Pilot safety: per-user daily grading cap, checked BEFORE the paid model
  // call. Counts the user's saved attempts since the start of the current UTC
  // day (RLS scopes the count to the authenticated user; no new storage).
  // Fails closed: if capacity cannot be verified, no model call is made.
  try {
    const { count, error: countError } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", utcDayStartIso());
    if (countError) throw countError;
    if (dailyLimitReached(count ?? 0, DAILY_GRADE_LIMIT)) {
      return fail(429, DAILY_LIMIT_ERROR_CODE);
    }
  } catch (err) {
    return failClosed(502, err);
  }

  // 3c. Server-authoritative scoring policy. The client's preflight choice is an
  // input, but the question text is ground truth and this decides marked /
  // provisional / feedback-only, the marking framework, the denominator, and any
  // template diagram cap — never the model.
  stage = "assessment_policy";
  const { requestedSource, requestedTotal, templateId, requestedFramework } = (body ??
    {}) as Record<string, unknown>;
  const policy = resolveScoringPolicy(q, {
    requestedSource: parseRequestedSource(requestedSource),
    requestedTotal: typeof requestedTotal === "number" ? requestedTotal : null,
    templateId: typeof templateId === "string" ? templateId : null,
    requestedFramework: parseFramework(requestedFramework),
    sourceMaterial,
  });

  // Commit 1 is text-only: no image is ever sent to the model.
  const hasImageAttachment = false;

  // 4. One OpenAI request, with a hard timeout. Fail closed on any problem, with
  // a safe server-side failure STAGE for observability (never leaked to client).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    const openai = getOpenAI();
    const response = await openai.responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // No tools: no web search, no file search, no code interpreter, no files.
        input: [
          { role: "developer", content: buildAssessmentInstructions() },
          {
            role: "user",
            content: buildAssessmentUserInput(
              subject,
              t,
              q,
              a,
              rubric,
              hasImageAttachment,
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
    if (response.status !== "completed") {
      throw new Error(`model status ${response.status}`);
    }
    const text = response.output_text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error("empty model output");
    }
    const parsed: unknown = JSON.parse(text);

    // Throws if incomplete/impossible/invalid -> caught below -> generic failure.
    stage = "schema_validation";
    const { feedback, assessment } = validateGradeResult(parsed, {
      hasImageAttachment,
      policy,
    });
    return NextResponse.json({ feedback, assessment });
  } catch (err) {
    // Server-only observability in EVERY environment: one structured event with
    // the stage + non-secret request id, never the answer, key, email, or raw
    // model output. The client sees only a generic code + support reference.
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
