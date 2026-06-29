import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/openai";
import { getRubric } from "@/lib/ai/rubric";
import {
  FEEDBACK_JSON_SCHEMA,
  buildInstructions,
  buildUserInput,
  validateFeedback,
} from "@/lib/ai/feedback-schema";
import {
  GRADING_MODEL,
  MAX_ANSWER_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  REASONING_EFFORT,
  REQUEST_TIMEOUT_MS,
  isGradableSubject,
} from "@/lib/ai/config";

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
  if (q.length > MAX_QUESTION_CHARS || a.length > MAX_ANSWER_CHARS) {
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

  // 4. One OpenAI request, with a hard timeout. Fail closed on any problem.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const openai = getOpenAI();
    const response = await openai.responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // No tools: no web search, no file search, no code interpreter, no files.
        input: [
          { role: "developer", content: buildInstructions() },
          { role: "user", content: buildUserInput(subject, t, q, a, rubric) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aptly_feedback",
            strict: true,
            schema: FEEDBACK_JSON_SCHEMA,
          },
        },
      },
      { signal: controller.signal }
    );

    if (response.status !== "completed") {
      return fail(502, "grading_failed");
    }

    const text = response.output_text;
    if (typeof text !== "string" || text.trim() === "") {
      return fail(502, "grading_failed");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail(502, "grading_failed");
    }

    // Throws if incomplete/invalid -> caught below -> generic failure.
    const feedback = validateFeedback(parsed);
    return NextResponse.json({ feedback });
  } catch {
    // Intentionally no logging of answer/key/raw response/headers.
    return fail(502, "grading_failed");
  } finally {
    clearTimeout(timer);
  }
}
