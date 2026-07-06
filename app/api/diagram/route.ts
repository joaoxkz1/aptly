import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/openai";
import {
  DIAGRAM_REVIEW_JSON_SCHEMA,
  buildDiagramReviewInstructions,
  buildDiagramReviewUserText,
  validateDiagramReview,
} from "@/lib/ai/diagram-schema";
import {
  DIAGRAM_DIMENSIONS_CODE,
  DIAGRAM_ERROR_CODE,
  DIAGRAM_LIMIT_ERROR_CODE,
  DIAGRAM_TOO_LARGE_CODE,
  DIAGRAM_UNSUPPORTED_TYPE_CODE,
  buildDiagramFailureLog,
  imageSizeBucket,
  supportReference,
  type DiagramStage,
} from "@/lib/ai/diagram-errors";
import {
  mimeForSniffedType,
  sniffImageDimensions,
  sniffImageType,
} from "@/lib/scan/image-validation";
import { dailyLimitReached, utcDayStartIso } from "@/lib/ai/rate-limit";
import {
  DAILY_DIAGRAM_REVIEW_LIMIT,
  DIAGRAM_MAX_OUTPUT_TOKENS,
  DIAGRAM_REASONING_EFFORT,
  DIAGRAM_REQUEST_TIMEOUT_MS,
  GRADING_MODEL,
  IMAGE_MAX_DIMENSION,
  MAX_ANSWER_CHARS,
  MAX_IMAGE_BYTES,
  MAX_QUESTION_CHARS,
} from "@/lib/ai/config";

export const runtime = "nodejs";

/**
 * Diagram Evidence V1 review route (image → cautious structured findings).
 *
 * FEEDBACK ONLY: this route reviews one close-up diagram photo in the context
 * of the question and written answer it belongs to, and returns structured,
 * mark-free study observations. It never marks, never classifies, never
 * touches attempts, grading, analytics, or the source gate — and it PERSISTS
 * NOTHING derived from the image. The image bytes are transient request data:
 * read, sent once to the vision model, and gone when the request ends. The
 * only durable write is a NO-CONTENT usage row for the daily cap, recorded
 * exclusively after a successful review.
 *
 * The question and answer travel here purely as review CONTEXT — the grading
 * route stays text-only and never sees the image (see scan-protections and
 * diagram-protections tests).
 *
 * Pipeline: authentication → server validation (magic bytes + dimensions +
 * size + text caps; client metadata is never trusted) → durable daily cap →
 * one GPT-5.4 vision call → strict schema validation with conservative
 * normalisation (fail closed) → usage record → safe response.
 */

// Generic error helper — never leaks internals to the client.
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

  // 2. Server-side upload validation. Nothing client-declared is trusted: the
  // upload must BE a real JPEG/PNG/WebP by its own magic bytes and fit the
  // acceptance ceiling; the question/answer context must fit the grading
  // caps. Failures here never consume the daily allowance and never reach
  // the model.
  let bytes: Uint8Array;
  let question: string;
  let answer: string;
  try {
    const form = await request.formData();
    const upload = form.get("image");
    if (!(upload instanceof Blob)) {
      return fail(400, "invalid_request");
    }
    if (upload.size === 0) {
      return fail(400, "invalid_request");
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return fail(413, DIAGRAM_TOO_LARGE_CODE);
    }
    bytes = new Uint8Array(await upload.arrayBuffer());
    // The diagram is reviewed only in the context of a real submission: a
    // question and a written answer are REQUIRED, so this route can never be
    // used as a generic image describer.
    const rawQuestion = form.get("question");
    const rawAnswer = form.get("answer");
    if (typeof rawQuestion !== "string" || typeof rawAnswer !== "string") {
      return fail(400, "invalid_request");
    }
    question = rawQuestion.trim();
    answer = rawAnswer.trim();
  } catch {
    // Malformed multipart body (or none at all).
    return fail(400, "invalid_request");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return fail(413, DIAGRAM_TOO_LARGE_CODE);
  }
  if (question === "" || answer === "") {
    return fail(400, "invalid_request");
  }
  if (question.length > MAX_QUESTION_CHARS || answer.length > MAX_ANSWER_CHARS) {
    return fail(400, "too_long");
  }
  const sniffed = sniffImageType(bytes);
  if (sniffed === null) {
    return fail(415, DIAGRAM_UNSUPPORTED_TYPE_CODE);
  }
  // Independent server-side dimension check (header fields only — no pixel
  // decode): the client's 2048px downscale cannot be bypassed with a direct
  // high-resolution upload. An unreadable header fails closed as unsupported;
  // neither outcome consumes the daily allowance or reaches the model.
  const dimensions = sniffImageDimensions(bytes, sniffed);
  if (dimensions === null) {
    return fail(415, DIAGRAM_UNSUPPORTED_TYPE_CODE);
  }
  if (Math.max(dimensions.width, dimensions.height) > IMAGE_MAX_DIMENSION) {
    return fail(413, DIAGRAM_DIMENSIONS_CODE);
  }
  const sizeBucket = imageSizeBucket(bytes.byteLength);

  const requestId = crypto.randomUUID();
  let stage: DiagramStage = "rate_limit";

  // Production-safe failure response: one structured log event (never image
  // bytes, file names, question/answer text, user ids, keys, or raw
  // provider/db errors) plus a generic client code with a short reference.
  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildDiagramFailureLog(stage, requestId, err, status, sizeBucket)));
    return NextResponse.json(
      { error: DIAGRAM_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  // 3. Durable daily cap, checked BEFORE the paid vision call. Counts the
  // user's no-content diagram_review_usage rows since the start of the
  // current UTC day (RLS scopes the count; rows are written only on SUCCESS,
  // so failed validations and failed model calls never consume capacity).
  // Fully independent from the Scan extraction cap. Fails closed: if
  // capacity cannot be verified, no model call is made.
  try {
    const { count, error: countError } = await supabase
      .from("diagram_review_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", utcDayStartIso());
    if (countError) throw countError;
    if (dailyLimitReached(count ?? 0, DAILY_DIAGRAM_REVIEW_LIMIT)) {
      return fail(429, DIAGRAM_LIMIT_ERROR_CODE);
    }
  } catch (err) {
    return failClosed(502, err);
  }

  // 4. One GPT-5.4 vision request with a hard timeout. The image travels as a
  // transient data URL inside this request only — it is never stored, logged,
  // or given a URL of its own. Fail closed on any problem.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIAGRAM_REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    const openai = getOpenAI();
    const imageUrl = `data:${mimeForSniffedType(sniffed)};base64,${Buffer.from(bytes).toString("base64")}`;
    const response = await openai.responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: DIAGRAM_REASONING_EFFORT },
        max_output_tokens: DIAGRAM_MAX_OUTPUT_TOKENS,
        // No tools: no web search, no file search, no code interpreter.
        input: [
          { role: "developer", content: buildDiagramReviewInstructions() },
          {
            role: "user",
            content: [
              { type: "input_text", text: buildDiagramReviewUserText(question, answer) },
              { type: "input_image", image_url: imageUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aptly_diagram_review",
            strict: true,
            schema: DIAGRAM_REVIEW_JSON_SCHEMA,
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

    // Throws on any shape/type problem or unexpected field (marks, scores,
    // comments, metadata) → caught below → generic safe failure. Also applies
    // the conservative normalisation: an unable_to_assess review carries NO
    // findings, and a comparison needs a clear read.
    stage = "schema_validation";
    const evidence = validateDiagramReview(parsed);

    // 5. Record ONE no-content usage row for the durable daily cap (user_id
    // stamped via `default auth.uid()`; nothing about the image, text, or
    // findings is stored here). An honest "unable to assess" consumes the
    // allowance too — it is a delivered review, and a free retry loop on a
    // hopeless photo would be an unbounded cost. Fails closed: if usage
    // cannot be recorded the review is not returned, so the cap can never be
    // silently bypassed.
    stage = "usage_record";
    const { error: usageError } = await supabase.from("diagram_review_usage").insert({});
    if (usageError) throw usageError;

    // 6. Structured, mark-free findings only — never a grade, framework,
    // total, or policy decision. The client attaches this to the attempt it
    // belongs to; grading has already run (or runs in parallel) text-only.
    return NextResponse.json({ evidence });
  } catch (err) {
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
