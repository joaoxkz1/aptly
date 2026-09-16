import "server-only";
import { getAdminClient } from "./admin";
import { findAttemptById } from "./server-authority";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import type { AssessmentSnapshot } from "@/lib/assessment/assessment-snapshot";
import type { Attempt } from "@/lib/types";

/** Completed requests keep their frozen contract across resolver upgrades. */
export async function completedEssayReplay(userId: string, key: string, request: Record<string, unknown>, imageHash: string | null): Promise<
  { kind: "none" } | { kind: "conflict" } | { kind: "replay"; attempt: Attempt }
> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("assessment_snapshots").select("snapshot,attempt_id")
    .eq("user_id", userId).eq("operation_key", key).maybeSingle();
  if (error) throw error;
  if (!data) return { kind: "none" };
  const stored = data.snapshot as AssessmentSnapshot;
  if (stored.contract.mode !== "holistic_diagram") return { kind: "none" };
  const { data: reservation, error: reservationError } = await admin.from("ai_usage_reservations")
    .select("request_fingerprint").eq("user_id", userId).eq("idempotency_key", key).eq("capability", "grade").maybeSingle();
  if (reservationError) throw reservationError;
  // The fingerprint was captured before observation, but after artifact hashing.
  const incomingHashes = imageHash ? [imageHash] : [];
  const savedHashes = stored.attachments.map(attachment => attachment.contentHash);
  if (!reservation || JSON.stringify(incomingHashes) !== JSON.stringify(savedHashes) ||
      requestFingerprint({ request, snapshot: { ...stored, observations: null } }) !== reservation.request_fingerprint) {
    return { kind: "conflict" };
  }
  const attempt = await findAttemptById(userId, data.attempt_id);
  if (!attempt) throw new Error("completed essay result unavailable");
  return { kind: "replay", attempt };
}
