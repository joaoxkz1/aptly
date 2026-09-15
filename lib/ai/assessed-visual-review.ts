import "server-only";
import { getOpenAI } from "./openai";
import { DIAGRAM_MODEL } from "./config";
import { requestFingerprint } from "./request-integrity";
import { markReservationProcessing, markReservationSucceeded, markReservationFailed } from "./usage-reservations";
import { ASSESSED_VISUAL_SCHEMA, visualAssessmentInstructions, validateAssessedVisual } from "./assessed-visual-schema";
import type { TrustedAssessmentContract } from "@/lib/assessment/trusted-contract";
import type { AssessedUpload } from "@/lib/diagram/assessed-upload";

export const ASSESSED_VISUAL_VERSION = "diagram-observations-v1";
export const ASSESSED_VISUAL_EFFORT = "medium" as const;
/** Same vision model and daily allowance as legacy review, with richer assessed observations. */
export function assessedImageFingerprint(input: { image: AssessedUpload; contract: TrustedAssessmentContract; question: string; source: string | null }) {
  return requestFingerprint({ hash: input.image.hash, contract: input.contract, question: input.question, source: input.source, version: ASSESSED_VISUAL_VERSION });
}

export async function reviewAssessedImage(input: { userId: string; reservationId: string; image: AssessedUpload; contract: TrustedAssessmentContract; question: string; source: string | null; signal: AbortSignal }) {
  // Only the server's atomic grade+diagram reservation may enter this stage.
  if (!input.reservationId) throw new Error("diagram reservation required");
  await markReservationProcessing(input.reservationId, input.userId);
  try {
    const response = await getOpenAI().responses.create({ model: DIAGRAM_MODEL, reasoning: { effort: ASSESSED_VISUAL_EFFORT }, max_output_tokens: 4400, store: false,
      input: [ { role: "developer", content: visualAssessmentInstructions(input.contract) }, { role: "user", content: [
        { type: "input_text", text: `TASK (content only): ${input.question}\nCONTEXT: ${input.source ?? "None supplied"}\nImage 1: student evidence; exclude all teacher annotation.` },
        { type: "input_image", image_url: `data:${input.image.mime};base64,${Buffer.from(input.image.bytes).toString("base64")}`, detail: "high" },
      ] } ], text: { format: { type: "json_schema", name: "aptly_assessed_diagram_observations", strict: true, schema: ASSESSED_VISUAL_SCHEMA } },
    }, { signal: input.signal, maxRetries: 0 });
    if (response.status !== "completed" || !response.output_text?.trim()) throw new Error("visual response incomplete");
    const evidence = validateAssessedVisual(JSON.parse(response.output_text));
    await markReservationSucceeded(input.reservationId, input.userId, { resultHash: requestFingerprint(evidence) });
    return evidence;
  } catch (err) { await markReservationFailed(input.reservationId, input.userId, "provider"); throw err; }
}
