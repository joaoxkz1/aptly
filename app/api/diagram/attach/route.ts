import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, userIdFromClient } from "@/lib/auth/verified-user";
import { validateDiagramReview } from "@/lib/ai/diagram-schema";
import { structuredResultHash } from "@/lib/ai/request-integrity";
import { fetchReservationForUser } from "@/lib/ai/usage-reservations";
import { attachDiagramEvidence } from "@/lib/supabase/server-authority";

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
    Object.keys(raw).some(
      (key) => key !== "attemptId" && key !== "reservationId" && key !== "evidence"
    ) ||
    !isUuid(raw.attemptId) ||
    !isUuid(raw.reservationId)
  ) {
    return fail(400, "invalid_request");
  }

  try {
    if (
      typeof raw.evidence !== "object" ||
      raw.evidence === null ||
      Array.isArray(raw.evidence) ||
      (raw.evidence as Record<string, unknown>).version !== 1
    ) {
      return fail(400, "invalid_request");
    }
    const review = { ...(raw.evidence as Record<string, unknown>) };
    delete review.version;
    const evidence = validateDiagramReview(review);
    const reservation = await fetchReservationForUser(userId, raw.reservationId);
    const hash = structuredResultHash(evidence);
    if (
      reservation === null ||
      reservation.capability !== "diagram" ||
      reservation.status !== "succeeded" ||
      reservation.operationGroupKey === null ||
      reservation.resultHash !== hash
    ) {
      return fail(400, "invalid_request");
    }
    const outcome = await attachDiagramEvidence({
      userId,
      attemptId: raw.attemptId,
      operationGroupKey: reservation.operationGroupKey,
      evidence,
    });
    return NextResponse.json({ attached: true, replayed: outcome === "already_attached" });
  } catch {
    return fail(400, "invalid_request");
  }
}
