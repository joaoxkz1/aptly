import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/openai";
import {
  EXTRACTION_JSON_SCHEMA,
  buildExtractionInstructions,
  buildExtractionUserText,
  hasExtractedContent,
  validateExtractionResult,
} from "@/lib/ai/extraction-schema";
import {
  EXTRACT_DIMENSIONS_CODE,
  EXTRACT_ERROR_CODE,
  EXTRACT_LIMIT_ERROR_CODE,
  EXTRACT_TOO_LARGE_CODE,
  EXTRACT_UNREADABLE_CODE,
  EXTRACT_UNSUPPORTED_TYPE_CODE,
  buildExtractFailureLog,
  imageSizeBucket,
  supportReference,
  type ExtractStage,
} from "@/lib/ai/extract-errors";
import {
  mimeForSniffedType,
  sniffImageDimensions,
  sniffImageType,
} from "@/lib/scan/image-validation";
import { dailyLimitReached, utcDayStartIso } from "@/lib/ai/rate-limit";
import {
  DAILY_EXTRACTION_LIMIT,
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_REASONING_EFFORT,
  EXTRACTION_REQUEST_TIMEOUT_MS,
  GRADING_MODEL,
  IMAGE_MAX_DIMENSION,
  MAX_IMAGE_BYTES,
} from "@/lib/ai/config";

export const runtime = "nodejs";

/**
 * Aptly Scan extraction route (image → candidate editable text).
 *
 * SCAN-TO-TEXT ONLY: this route transcribes one uploaded image into candidate
 * question/answer/sourceMaterial text for the student to review. It never
 * marks, never classifies, never touches attempts, analytics, or the diagram
 * policy — and it PERSISTS NOTHING derived from the image. The image bytes
 * are transient request data: read, sent once to the vision model, and gone
 * when the request ends. The only durable write is a NO-CONTENT usage row for
 * the daily cap, recorded exclusively after a successful extraction.
 *
 * Pipeline: authentication → server validation (magic bytes + size; client
 * metadata is never trusted) → durable daily cap → one GPT-5.4 vision call →
 * strict schema validation (fail closed) → usage record → safe response.
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
  // acceptance ceiling. Failures here never consume the daily allowance and
  // never reach the model.
  let bytes: Uint8Array;
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
      return fail(413, EXTRACT_TOO_LARGE_CODE);
    }
    bytes = new Uint8Array(await upload.arrayBuffer());
  } catch {
    // Malformed multipart body (or none at all).
    return fail(400, "invalid_request");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return fail(413, EXTRACT_TOO_LARGE_CODE);
  }
  const sniffed = sniffImageType(bytes);
  if (sniffed === null) {
    return fail(415, EXTRACT_UNSUPPORTED_TYPE_CODE);
  }
  // Independent server-side dimension check (header fields only — no pixel
  // decode): the client's 2048px downscale cannot be bypassed with a direct
  // high-resolution upload. An unreadable header fails closed as unsupported;
  // neither outcome consumes the daily allowance or reaches the model.
  const dimensions = sniffImageDimensions(bytes, sniffed);
  if (dimensions === null) {
    return fail(415, EXTRACT_UNSUPPORTED_TYPE_CODE);
  }
  if (Math.max(dimensions.width, dimensions.height) > IMAGE_MAX_DIMENSION) {
    return fail(413, EXTRACT_DIMENSIONS_CODE);
  }
  const sizeBucket = imageSizeBucket(bytes.byteLength);

  const requestId = crypto.randomUUID();
  let stage: ExtractStage = "rate_limit";

  // Production-safe failure response: one structured log event (never image
  // bytes, file names, extracted text, user ids, keys, or raw provider/db
  // errors) plus a generic client code with a short non-secret reference.
  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildExtractFailureLog(stage, requestId, err, status, sizeBucket)));
    return NextResponse.json(
      { error: EXTRACT_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  // 3. Durable daily cap, checked BEFORE the paid vision call. Counts the
  // user's no-content scan_extraction_usage rows since the start of the
  // current UTC day (RLS scopes the count; rows are written only on SUCCESS,
  // so failed validations and failed model calls never consume capacity).
  // Fails closed: if capacity cannot be verified, no model call is made.
  try {
    const { count, error: countError } = await supabase
      .from("scan_extraction_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", utcDayStartIso());
    if (countError) throw countError;
    if (dailyLimitReached(count ?? 0, DAILY_EXTRACTION_LIMIT)) {
      return fail(429, EXTRACT_LIMIT_ERROR_CODE);
    }
  } catch (err) {
    return failClosed(502, err);
  }

  // 4. One GPT-5.4 vision request with a hard timeout. The image travels as a
  // transient data URL inside this request only — it is never stored, logged,
  // or given a URL of its own. Fail closed on any problem.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    const openai = getOpenAI();
    const imageUrl = `data:${mimeForSniffedType(sniffed)};base64,${Buffer.from(bytes).toString("base64")}`;
    const response = await openai.responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: EXTRACTION_REASONING_EFFORT },
        max_output_tokens: EXTRACTION_MAX_OUTPUT_TOKENS,
        // No tools: no web search, no file search, no code interpreter.
        input: [
          { role: "developer", content: buildExtractionInstructions() },
          {
            role: "user",
            content: [
              { type: "input_text", text: buildExtractionUserText() },
              { type: "input_image", image_url: imageUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aptly_scan_extraction",
            strict: true,
            schema: EXTRACTION_JSON_SCHEMA,
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

    // Throws on any shape/type problem or unexpected field (marks, framework
    // labels, comments, metadata) → caught below → generic safe failure.
    stage = "schema_validation";
    const extracted = validateExtractionResult(parsed);

    // Unreadable/empty page: an honest, dedicated outcome — no fields change,
    // no usage is consumed, and the client shows actionable copy.
    if (!hasExtractedContent(extracted)) {
      return fail(422, EXTRACT_UNREADABLE_CODE);
    }

    // 5. Record ONE no-content usage row for the durable daily cap (user_id
    // stamped via `default auth.uid()`; nothing about the image or text is
    // stored). Fails closed: if usage cannot be recorded the extraction is
    // not returned, so the cap can never be silently bypassed.
    stage = "usage_record";
    const { error: usageError } = await supabase.from("scan_extraction_usage").insert({});
    if (usageError) throw usageError;

    // 6. Candidate text only — never a grade, framework, total, or policy
    // decision. The client applies its fill-only-empty-fields rule and the
    // student reviews everything before the normal grading flow runs.
    return NextResponse.json({ extracted });
  } catch (err) {
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
