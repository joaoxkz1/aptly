import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
import { dailyLimitReached, utcDayStartIso } from "@/lib/ai/rate-limit";
import {
  DAILY_PRACTICE_GENERATION_LIMIT,
  GRADING_MODEL,
  PRACTICE_MAX_OUTPUT_TOKENS,
  PRACTICE_REQUEST_TIMEOUT_MS,
  REASONING_EFFORT,
} from "@/lib/ai/config";

export const runtime = "nodejs";

/**
 * Targeted practice generation (Practice Loop).
 *
 * SERVER-AUTHORITATIVE: the ONLY client input read is the boolean `regenerate`
 * intent behind "Generate another question". The target topic, skill,
 * framework, and mark total are recomputed here from the user's own saved
 * attempts via the canonical next focus — the client cannot force any of them.
 *
 * IDEMPOTENT: unless `regenerate` is explicitly true, the route first reopens
 * the user's latest unanswered recent practice question (see
 * lib/assessment/practice-reuse.ts). A refresh, back-navigation, duplicate
 * tab, double-click, or network retry therefore never buys another paid
 * generation and never creates another row — and, because reuse is checked
 * BEFORE the daily cap, an existing question stays reachable even at the
 * limit. The limit itself counts only rows genuinely created.
 */
export async function POST(request: Request) {
  // 1. Require an authenticated user (verified via getClaims, not getSession).
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims == null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. The one honored client field: an explicit `regenerate: true` boolean.
  // Anything else — a missing/malformed body, a truthy string, extra fields —
  // safely resolves to the idempotent reuse-first path. Forcing this flag
  // gains nothing beyond what the visible button does: one rate-limited,
  // server-targeted generation.
  let regenerate = false;
  try {
    const body: unknown = await request.json();
    regenerate =
      typeof body === "object" &&
      body !== null &&
      (body as Record<string, unknown>).regenerate === true;
  } catch {
    // No body (or invalid JSON) → reuse-first.
  }

  const requestId = crypto.randomUUID();
  let stage: PracticeStage = "reuse_lookup";

  // Production-safe failure response: one structured log event (never student
  // data, insights, the key, or raw model output) plus a generic client code.
  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildPracticeFailureLog(stage, requestId, err, status)));
    return NextResponse.json(
      { error: PRACTICE_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  // 3. Idempotency: reopen the latest unanswered recent question instead of
  // generating. The attempts are fetched once here and reused for target
  // derivation below. Fails closed — a broken lookup never falls through to
  // an unintended paid call.
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

  // 4. Pilot safety: per-user daily generation cap, checked BEFORE the paid
  // model call. Counts the user's practice questions created since the start
  // of the current UTC day (RLS scopes the count) — reused questions never
  // add to it. Fails closed.
  stage = "rate_limit";
  try {
    const { count, error: countError } = await supabase
      .from("practice_questions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", utcDayStartIso());
    if (countError) throw countError;
    if (dailyLimitReached(count ?? 0, DAILY_PRACTICE_GENERATION_LIMIT)) {
      return NextResponse.json({ error: PRACTICE_LIMIT_ERROR_CODE }, { status: 429 });
    }
  } catch (err) {
    return failClosed(502, err);
  }

  // 5. Server-side target: recompute the canonical next focus from the user's
  // SAVED attempts. An arbitrary topic/skill/framework/total can never be
  // requested.
  stage = "target_derivation";
  let target;
  try {
    target = derivePracticeTarget(attempts);
  } catch (err) {
    return failClosed(502, err);
  }
  if (target == null) {
    // Honest, expected outcome — not a failure: not enough marked evidence yet.
    return NextResponse.json({ error: PRACTICE_NO_FOCUS_CODE }, { status: 409 });
  }

  // 6. One OpenAI request with a hard timeout; fail closed on any problem.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRACTICE_REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    const openai = getOpenAI();
    const response = await openai.responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: PRACTICE_MAX_OUTPUT_TOKENS,
        // No tools: no web search, no file search, no code interpreter.
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
    if (response.status !== "completed") {
      throw new Error(`model status ${response.status}`);
    }
    const text = response.output_text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error("empty model output");
    }
    const parsed: unknown = JSON.parse(text);

    // Deterministic, fail-closed validation against the server frame: explicit
    // total, supported framework, no diagram reliance, no official-IB claim,
    // usable original source where required.
    stage = "schema_validation";
    const generated = validateGeneratedPractice(parsed, target);

    // 7. Persist privately (RLS; user_id stamped via `default auth.uid()`).
    // The stored row — never client text — is what grading later reads.
    stage = "persistence";
    const { data: row, error: insertError } = await supabase
      .from("practice_questions")
      .insert({
        question: generated.question,
        source_material: generated.sourceMaterial,
        framework: target.framework,
        mark_total: target.markTotal,
        topic_code: target.topicCode,
        topic_label: target.topicLabel,
        skill: target.skill,
        why: target.why,
      })
      .select("id, created_at")
      .single();
    if (insertError) throw insertError;
    const saved = row as { id: string; created_at: string };

    return NextResponse.json({
      practiceQuestion: {
        id: saved.id,
        createdAt: saved.created_at,
        question: generated.question,
        sourceMaterial: generated.sourceMaterial,
        framework: target.framework,
        markTotal: target.markTotal,
        topicCode: target.topicCode,
        topicLabel: target.topicLabel,
        skill: target.skill,
        why: target.why,
      },
      reused: false,
    });
  } catch (err) {
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
