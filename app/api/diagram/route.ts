import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, userIdFromClient } from "@/lib/auth/verified-user";
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
import {
  DAILY_DIAGRAM_REVIEW_LIMIT,
  DIAGRAM_MAX_OUTPUT_TOKENS,
  DIAGRAM_REASONING_EFFORT,
  DIAGRAM_REQUEST_TIMEOUT_MS,
  GRADING_MODEL,
  IMAGE_MAX_DIMENSION,
  MAX_ANSWER_CHARS,
  MAX_PROCESSED_IMAGE_BYTES,
  MAX_QUESTION_CHARS,
} from "@/lib/ai/config";
import { requestFingerprint, structuredResultHash } from "@/lib/ai/request-integrity";
import {
  markReservationFailed,
  markReservationProcessing,
  markReservationSucceeded,
  reserveAIUsage,
} from "@/lib/ai/usage-reservations";

export const runtime = "nodejs";
const MAX_MULTIPART_OVERHEAD = 96 * 1024;
const ALLOWED_FIELDS = new Set([
  "image",
  "question",
  "answer",
  "idempotencyKey",
  "attemptOperationKey",
]);

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
    return fail(413, DIAGRAM_TOO_LARGE_CODE);
  }

  let bytes: Uint8Array;
  let question: string;
  let answer: string;
  let idempotencyKey: string;
  let attemptOperationKey: string;
  try {
    const form = await request.formData();
    if (
      [...form.keys()].some((key) => !ALLOWED_FIELDS.has(key)) ||
      [...ALLOWED_FIELDS].some((key) => form.getAll(key).length !== 1)
    ) {
      return fail(400, "invalid_request");
    }
    const upload = form.get("image");
    const rawQuestion = form.get("question");
    const rawAnswer = form.get("answer");
    const requestKey = form.get("idempotencyKey");
    const operationKey = form.get("attemptOperationKey");
    if (
      !(upload instanceof Blob) ||
      upload.size === 0 ||
      typeof rawQuestion !== "string" ||
      typeof rawAnswer !== "string" ||
      !isUuid(requestKey) ||
      !isUuid(operationKey)
    ) {
      return fail(400, "invalid_request");
    }
    if (upload.size > MAX_PROCESSED_IMAGE_BYTES) return fail(413, DIAGRAM_TOO_LARGE_CODE);
    bytes = new Uint8Array(await upload.arrayBuffer());
    question = rawQuestion.trim();
    answer = rawAnswer.trim();
    idempotencyKey = requestKey;
    attemptOperationKey = operationKey;
  } catch {
    return fail(400, "invalid_request");
  }
  if (bytes.byteLength > MAX_PROCESSED_IMAGE_BYTES) return fail(413, DIAGRAM_TOO_LARGE_CODE);
  if (question === "" || answer === "") return fail(400, "invalid_request");
  if (question.length > MAX_QUESTION_CHARS || answer.length > MAX_ANSWER_CHARS) {
    return fail(400, "too_long");
  }
  const sniffed = sniffImageType(bytes);
  if (sniffed === null) return fail(415, DIAGRAM_UNSUPPORTED_TYPE_CODE);
  const dimensions = sniffImageDimensions(bytes, sniffed);
  if (dimensions === null) return fail(415, DIAGRAM_UNSUPPORTED_TYPE_CODE);
  if (Math.max(dimensions.width, dimensions.height) > IMAGE_MAX_DIMENSION) {
    return fail(413, DIAGRAM_DIMENSIONS_CODE);
  }

  const sizeBucket = imageSizeBucket(bytes.byteLength);
  const requestId = crypto.randomUUID();
  let stage: DiagramStage = "rate_limit";
  let reservationId: string | null = null;
  let providerDispatched = false;
  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildDiagramFailureLog(stage, requestId, err, status, sizeBucket)));
    return NextResponse.json(
      { error: DIAGRAM_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  try {
    const reservation = await reserveAIUsage({
      userId,
      capability: "diagram",
      idempotencyKey,
      operationGroupKey: attemptOperationKey,
      // Bind only to the random grade operation. Never retain a fingerprint
      // derived from image bytes or the student's text.
      fingerprint: requestFingerprint({ capability: "diagram", attemptOperationKey }),
      dailyLimit: DAILY_DIAGRAM_REVIEW_LIMIT,
    });
    reservationId = reservation.reservationId;
    if (reservation.outcome === "limited") return fail(429, DIAGRAM_LIMIT_ERROR_CODE);
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
  const timer = setTimeout(() => controller.abort(), DIAGRAM_REQUEST_TIMEOUT_MS);
  try {
    stage = "openai";
    providerDispatched = true;
    const imageUrl = `data:${mimeForSniffedType(sniffed)};base64,${Buffer.from(bytes).toString("base64")}`;
    const response = await getOpenAI().responses.create(
      {
        model: GRADING_MODEL,
        reasoning: { effort: DIAGRAM_REASONING_EFFORT },
        max_output_tokens: DIAGRAM_MAX_OUTPUT_TOKENS,
        store: false,
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
    if (response.status !== "completed") throw new Error(`model status ${response.status}`);
    if (typeof response.output_text !== "string" || response.output_text.trim() === "") {
      throw new Error("empty model output");
    }
    stage = "schema_validation";
    const evidence = validateDiagramReview(JSON.parse(response.output_text));
    await markReservationSucceeded(reservationId, userId, {
      resultHash: structuredResultHash(evidence),
    });
    return NextResponse.json({ evidence, reservationId });
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
