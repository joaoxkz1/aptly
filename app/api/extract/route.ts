import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, userIdFromClient } from "@/lib/auth/verified-user";
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
import {
  DAILY_EXTRACTION_LIMIT,
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_REASONING_EFFORT,
  EXTRACTION_REQUEST_TIMEOUT_MS,
  GRADING_MODEL,
  IMAGE_MAX_DIMENSION,
  MAX_PROCESSED_IMAGE_BYTES,
} from "@/lib/ai/config";
import {
  markReservationFailed,
  markReservationProcessing,
  markReservationSucceeded,
  reserveAIUsage,
} from "@/lib/ai/usage-reservations";
import { requestFingerprint } from "@/lib/ai/request-integrity";

export const runtime = "nodejs";
const MAX_MULTIPART_OVERHEAD = 64 * 1024;

function fail(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const userId = await userIdFromClient(supabase);
  if (userId === null) return fail(401, "unauthorized");

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PROCESSED_IMAGE_BYTES + MAX_MULTIPART_OVERHEAD
  ) {
    return fail(413, EXTRACT_TOO_LARGE_CODE);
  }

  let bytes: Uint8Array;
  let idempotencyKey: string;
  try {
    const form = await request.formData();
    if (
      [...form.keys()].some((key) => key !== "image" && key !== "idempotencyKey") ||
      form.getAll("image").length !== 1 ||
      form.getAll("idempotencyKey").length !== 1
    ) {
      return fail(400, "invalid_request");
    }
    const upload = form.get("image");
    const key = form.get("idempotencyKey");
    if (!(upload instanceof Blob) || upload.size === 0 || !isUuid(key)) {
      return fail(400, "invalid_request");
    }
    if (upload.size > MAX_PROCESSED_IMAGE_BYTES) return fail(413, EXTRACT_TOO_LARGE_CODE);
    bytes = new Uint8Array(await upload.arrayBuffer());
    idempotencyKey = key;
  } catch {
    return fail(400, "invalid_request");
  }
  if (bytes.byteLength > MAX_PROCESSED_IMAGE_BYTES) return fail(413, EXTRACT_TOO_LARGE_CODE);
  const sniffed = sniffImageType(bytes);
  if (sniffed === null) return fail(415, EXTRACT_UNSUPPORTED_TYPE_CODE);
  const dimensions = sniffImageDimensions(bytes, sniffed);
  if (dimensions === null) return fail(415, EXTRACT_UNSUPPORTED_TYPE_CODE);
  if (Math.max(dimensions.width, dimensions.height) > IMAGE_MAX_DIMENSION) {
    return fail(413, EXTRACT_DIMENSIONS_CODE);
  }

  const sizeBucket = imageSizeBucket(bytes.byteLength);
  const requestId = crypto.randomUUID();
  let stage: ExtractStage = "rate_limit";
  let reservationId: string | null = null;
  let providerDispatched = false;

  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildExtractFailureLog(stage, requestId, err, status, sizeBucket)));
    return NextResponse.json(
      { error: EXTRACT_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  try {
    const reservation = await reserveAIUsage({
      userId,
      capability: "scan",
      idempotencyKey,
      // Deliberately not derived from the image: the random idempotency key is
      // sufficient, and a durable image-content hash would violate privacy.
      fingerprint: requestFingerprint({ capability: "scan" }),
      dailyLimit: DAILY_EXTRACTION_LIMIT,
    });
    reservationId = reservation.reservationId;
    if (reservation.outcome === "limited") return fail(429, EXTRACT_LIMIT_ERROR_CODE);
    if (reservation.outcome === "conflict") return fail(409, "idempotency_conflict");
    if (reservation.outcome === "in_progress") return fail(409, "request_in_progress");
    if (reservation.outcome === "replay") return fail(409, "result_not_retained");
    if (reservation.outcome === "failed") return fail(409, "request_failed");
    if (reservationId === null) throw new Error("missing reservation id");
    await markReservationProcessing(reservationId, userId);
  } catch (err) {
    return failClosed(502, err);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    providerDispatched = true;
    const imageUrl = `data:${mimeForSniffedType(sniffed)};base64,${Buffer.from(bytes).toString("base64")}`;
    const response = await getOpenAI().responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: EXTRACTION_REASONING_EFFORT },
        max_output_tokens: EXTRACTION_MAX_OUTPUT_TOKENS,
        store: false,
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
    if (response.status !== "completed") throw new Error(`model status ${response.status}`);
    if (typeof response.output_text !== "string" || response.output_text.trim() === "") {
      throw new Error("empty model output");
    }
    stage = "schema_validation";
    const extracted = validateExtractionResult(JSON.parse(response.output_text));
    await markReservationSucceeded(reservationId, userId);
    if (!hasExtractedContent(extracted)) return fail(422, EXTRACT_UNREADABLE_CODE);
    return NextResponse.json({ extracted });
  } catch (err) {
    await markReservationFailed(
      reservationId,
      userId,
      providerDispatched
        ? stage === "schema_validation"
          ? "validation"
          : "provider"
        : "internal"
    );
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
